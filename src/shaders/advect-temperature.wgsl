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
var srcTemperature: texture_2d<f32>;

@group(0) @binding(1)
var velocityTex: texture_2d<f32>;

@group(0) @binding(2)
var dstTemperature: texture_storage_2d<rgba32float, write>;

@group(0) @binding(3)
var<storage, read> domainElements: array<DomainElement, MAX_DOMAIN_ELEMENTS>;

@group(0) @binding(4)
var<uniform> params: Params;

fn sampleScalar(tex: texture_2d<f32>, uv: vec2f) -> f32 {
    let size = vec2f(textureDimensions(tex));
    let maxIndex = vec2i(textureDimensions(tex)) - vec2i(1);

    let pos = clamp(uv, vec2f(0.0), vec2f(0.999999)) * size - vec2f(0.5);
    let baseFloor = floor(pos);
    let base = vec2i(baseFloor);
    let frac = pos - baseFloor;

    let p00 = clamp(base, vec2i(0), maxIndex);
    let p10 = clamp(base + vec2i(1, 0), vec2i(0), maxIndex);
    let p01 = clamp(base + vec2i(0, 1), vec2i(0), maxIndex);
    let p11 = clamp(base + vec2i(1, 1), vec2i(0), maxIndex);

    let s00 = textureLoad(tex, p00, 0).x;
    let s10 = textureLoad(tex, p10, 0).x;
    let s01 = textureLoad(tex, p01, 0).x;
    let s11 = textureLoad(tex, p11, 0).x;

    let a = mix(s00, s10, frac.x);
    let b = mix(s01, s11, frac.x);

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

fn loadScalar(tex: texture_2d<f32>, p: vec2i, size: vec2u) -> f32 {
    if (
        p.x < 0 ||
        p.y < 0 ||
        p.x >= i32(size.x) ||
        p.y >= i32(size.y)
    ) {
        return params.ambientTemperature;
    }

    let solid = getSolidSample((vec2f(p) + vec2f(0.5)) * vec2f(params.dx, params.dy));

    if (solid.isSolid) {
        return solid.temperature;
    }

    return textureLoad(tex, p, 0).x;
}

fn scalarLaplacian(tex: texture_2d<f32>, p: vec2i, size: vec2u) -> f32 {
    let center = loadScalar(tex, p, size);
    let left = loadScalar(tex, p + vec2i(-1, 0), size);
    let right = loadScalar(tex, p + vec2i(1, 0), size);
    let top = loadScalar(tex, p + vec2i(0, -1), size);
    let bottom = loadScalar(tex, p + vec2i(0, 1), size);

    let ddx = (left - 2.0 * center + right) / (params.dx * params.dx);
    let ddy = (top - 2.0 * center + bottom) / (params.dy * params.dy);

    return ddx + ddy;
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
    let sizeU = textureDimensions(srcTemperature);

    if (id.x >= sizeU.x || id.y >= sizeU.y) {
        return;
    }

    if (isOuterBoundary(id.xy, sizeU)) {
        textureStore(
            dstTemperature,
            vec2i(id.xy),
            vec4f(
                params.ambientTemperature,
                params.ambientTemperature,
                params.ambientTemperature,
                1.0
            )
        );
        return;
    }

    let solid = getSolidSample(cellCenterPosition(id.xy));

    if (solid.isSolid) {
        textureStore(
            dstTemperature,
            vec2i(id.xy),
            vec4f(
                solid.temperature,
                solid.temperature,
                solid.temperature,
                1.0
            )
        );
        return;
    }

    let vel = textureLoad(velocityTex, vec2i(id.xy), 0).xy;
    let position = cellCenterPosition(id.xy);
    let prevPosition = position - vel * params.dt;
    let prevUv = prevPosition / domainSizeMeters();

    var temperature = sampleScalar(srcTemperature, prevUv);
    temperature =
        temperature +
        params.thermalDiffusivity * params.dt * scalarLaplacian(srcTemperature, vec2i(id.xy), sizeU);
    temperature = clamp(
        temperature,
        params.ambientTemperature,
        params.heaterTemperature
    );

    textureStore(
        dstTemperature,
        vec2i(id.xy),
        vec4f(temperature, temperature, temperature, 1.0)
    );
}
