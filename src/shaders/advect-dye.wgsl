struct Params {
    time: f32,
    dt: f32,
    width: f32,
    height: f32,
    dx: f32,
    dy: f32,
    ambientTemperature: f32,
    gravity: f32,
    thermalExpansion: f32,
    kinematicViscosity: f32,
    thermalDiffusivity: f32,
    dyeDecayRate: f32,
    heaterTemperature: f32,
    _pad0: f32,
    _pad1: f32,
    _pad2: f32,
    dyeBrushFromX: f32,
    dyeBrushFromY: f32,
    dyeBrushToX: f32,
    dyeBrushToY: f32,
    dyeBrushRadius: f32,
    dyeBrushStrength: f32,
    dyeBrushActive: f32,
    _pad3: f32,
}

const DOMAIN_ELEMENT_TYPE_NONE: u32 = 0u;
const DOMAIN_ELEMENT_TYPE_AMBIENT_WALL: u32 = 1u;
const DOMAIN_ELEMENT_TYPE_HOT_CIRCLE: u32 = 2u;
const MAX_DOMAIN_ELEMENTS: u32 = 16u;
const DOMAIN_ELEMENT_DYNAMIC_TEMPERATURE_THRESHOLD: f32 = -1e29;

struct DomainElement {
    kind: u32,
    _pad0: u32,
    _pad1: u32,
    _pad2: u32,
    data0: vec4f,
    data1: vec4f,
}

struct SolidSample {
    isSolid: bool,
    temperature: f32,
}

@group(0) @binding(0)
var srcDye: texture_2d<f32>;

@group(0) @binding(1)
var velocityTex: texture_2d<f32>;

@group(0) @binding(2)
var dstDye: texture_storage_2d<rgba32float, write>;

@group(0) @binding(3)
var<storage, read> domainElements: array<DomainElement, MAX_DOMAIN_ELEMENTS>;

@group(0) @binding(4)
var<uniform> params: Params;

fn sampleDye(uv: vec2f) -> f32 {
    if (
        uv.x < 0.0 ||
        uv.x > 1.0 ||
        uv.y < 0.0 ||
        uv.y > 1.0
    ) {
        return 0.0;
    }

    let size = vec2f(textureDimensions(srcDye));
    let maxIndex = vec2i(textureDimensions(srcDye)) - vec2i(1);

    let pos = clamp(uv, vec2f(0.0), vec2f(0.999999)) * size - vec2f(0.5);
    let baseFloor = floor(pos);
    let base = vec2i(baseFloor);
    let frac = pos - baseFloor;

    let p00 = clamp(base, vec2i(0), maxIndex);
    let p10 = clamp(base + vec2i(1, 0), vec2i(0), maxIndex);
    let p01 = clamp(base + vec2i(0, 1), vec2i(0), maxIndex);
    let p11 = clamp(base + vec2i(1, 1), vec2i(0), maxIndex);

    let d00 = textureLoad(srcDye, p00, 0).x;
    let d10 = textureLoad(srcDye, p10, 0).x;
    let d01 = textureLoad(srcDye, p01, 0).x;
    let d11 = textureLoad(srcDye, p11, 0).x;

    let a = mix(d00, d10, frac.x);
    let b = mix(d01, d11, frac.x);

    return mix(a, b, frac.y);
}

fn domainSizeMeters() -> vec2f {
    return vec2f(params.width * params.dx, params.height * params.dy);
}

fn cellCenterPosition(id: vec2u) -> vec2f {
    return (vec2f(id.xy) + vec2f(0.5)) * vec2f(params.dx, params.dy);
}

fn isOuterBoundary(id: vec2u, size: vec2u) -> bool {
    return (
        id.x == 0u ||
        id.y == 0u ||
        id.x + 1u >= size.x ||
        id.y + 1u >= size.y
    );
}

fn distanceToSegment(point: vec2f, start: vec2f, end: vec2f) -> f32 {
    let delta = end - start;
    let lengthSquared = max(dot(delta, delta), 1e-12);
    let t = clamp(dot(point - start, delta) / lengthSquared, 0.0, 1.0);
    let closest = start + t * delta;

    return distance(point, closest);
}

fn getSolidSample(position: vec2f) -> SolidSample {
    for (var index = 0u; index < MAX_DOMAIN_ELEMENTS; index = index + 1u) {
        let element = domainElements[index];

        if (element.kind == DOMAIN_ELEMENT_TYPE_NONE) {
            continue;
        }

        if (element.kind == DOMAIN_ELEMENT_TYPE_AMBIENT_WALL) {
            if (distanceToSegment(position, element.data0.xy, element.data0.zw) <= 0.5 * element.data1.x) {
                return SolidSample(true, params.ambientTemperature);
            }

            continue;
        }

        if (element.kind == DOMAIN_ELEMENT_TYPE_HOT_CIRCLE) {
            let offset = position - element.data0.xy;

            if (dot(offset, offset) <= element.data0.z * element.data0.z) {
                let hotTemperature = select(
                    element.data0.w,
                    params.heaterTemperature,
                    element.data0.w <= DOMAIN_ELEMENT_DYNAMIC_TEMPERATURE_THRESHOLD
                );

                return SolidSample(true, hotTemperature);
            }
        }
    }

    return SolidSample(false, params.ambientTemperature);
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
    let sizeU = textureDimensions(srcDye);

    if (id.x >= sizeU.x || id.y >= sizeU.y) {
        return;
    }

    if (isOuterBoundary(id.xy, sizeU)) {
        textureStore(dstDye, vec2i(id.xy), vec4f(0.0, 0.0, 0.0, 1.0));
        return;
    }

    let position = cellCenterPosition(id.xy);

    if (getSolidSample(position).isSolid) {
        textureStore(dstDye, vec2i(id.xy), vec4f(0.0, 0.0, 0.0, 1.0));
        return;
    }

    let vel = textureLoad(velocityTex, vec2i(id.xy), 0).xy;
    let prevPosition = position - vel * params.dt;
    let prevUv = prevPosition / domainSizeMeters();

    var dye = sampleDye(prevUv);
    dye = dye * exp(-params.dyeDecayRate * params.dt);

    if (params.dyeBrushActive > 0.5) {
        let brushFrom = vec2f(params.dyeBrushFromX, params.dyeBrushFromY);
        let brushTo = vec2f(params.dyeBrushToX, params.dyeBrushToY);
        let brushDistance = distanceToSegment(position, brushFrom, brushTo);
        let emitter = exp(
            -0.5 * (brushDistance * brushDistance) /
            (params.dyeBrushRadius * params.dyeBrushRadius)
        );

        dye = clamp(
            dye + params.dyeBrushStrength * params.dt * emitter,
            0.0,
            1.0
        );
    }

    let outflowThickness = max(12.0 * params.dy, 0.04 * domainSizeMeters().y);
    let outletFade = 1.0 - smoothstep(0.0, outflowThickness, position.y);
    dye = dye * (1.0 - outletFade);
    dye = clamp(dye, 0.0, 1.0);

    textureStore(dstDye, vec2i(id.xy), vec4f(dye, dye, dye, 1.0));
}
