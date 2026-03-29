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
var velocityTex: texture_2d<f32>;

@group(0) @binding(1)
var divergenceOut: texture_storage_2d<rgba32float, write>;

@group(0) @binding(2)
var<storage, read> domainElements: array<DomainElement, MAX_DOMAIN_ELEMENTS>;

@group(0) @binding(3)
var<uniform> params: Params;

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

fn isSolidIndex(p: vec2i, size: vec2u) -> bool {
    if (
        p.x < 0 ||
        p.y < 0 ||
        p.x >= i32(size.x) ||
        p.y >= i32(size.y)
    ) {
        return true;
    }

    return getSolidSample((vec2f(p) + vec2f(0.5)) * vec2f(params.dx, params.dy)).isSolid;
}

fn loadVelocity(p: vec2i, size: vec2u) -> vec2f {
    if (isSolidIndex(p, size)) {
        return vec2f(0.0);
    }

    return textureLoad(velocityTex, p, 0).xy;
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
    let sizeU = textureDimensions(velocityTex);

    if (id.x >= sizeU.x || id.y >= sizeU.y) {
        return;
    }

    let p = vec2i(id.xy);

    if (isSolidIndex(p, sizeU)) {
        textureStore(divergenceOut, p, vec4f(0.0, 0.0, 0.0, 1.0));
        return;
    }

    let left = loadVelocity(p + vec2i(-1, 0), sizeU);
    let right = loadVelocity(p + vec2i(1, 0), sizeU);
    let top = loadVelocity(p + vec2i(0, -1), sizeU);
    let bottom = loadVelocity(p + vec2i(0, 1), sizeU);

    let divergence =
        (right.x - left.x) / (2.0 * params.dx) +
        (bottom.y - top.y) / (2.0 * params.dy);

    textureStore(divergenceOut, p, vec4f(divergence, 0.0, 0.0, 1.0));
}
