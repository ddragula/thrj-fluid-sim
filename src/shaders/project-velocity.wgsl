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
    heaterCenterX: f32,
    heaterCenterY: f32,
    heaterRadius: f32,
    dyeBrushFromX: f32,
    dyeBrushFromY: f32,
    dyeBrushToX: f32,
    dyeBrushToY: f32,
    dyeBrushRadius: f32,
    dyeBrushStrength: f32,
    dyeBrushActive: f32,
    _pad1: f32,
}

@group(0) @binding(0)
var velocityTex: texture_2d<f32>;

@group(0) @binding(1)
var pressureTex: texture_2d<f32>;

@group(0) @binding(2)
var velocityOut: texture_storage_2d<rgba32float, write>;

@group(0) @binding(3)
var<uniform> params: Params;


fn isOuterBoundary(id: vec2u, size: vec2u) -> bool {
    return (
        id.x == 0u ||
        id.y == 0u ||
        id.x + 1u >= size.x ||
        id.y + 1u >= size.y
    );
}

fn isHeaterPosition(position: vec2f) -> bool {
    let offset = position - vec2f(params.heaterCenterX, params.heaterCenterY);
    return dot(offset, offset) <= params.heaterRadius * params.heaterRadius;
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

    return isHeaterPosition((vec2f(p) + vec2f(0.5)) * vec2f(params.dx, params.dy));
}

fn loadPressure(p: vec2i, size: vec2u, fallback: f32) -> f32 {
    if (isSolidIndex(p, size)) {
        return fallback;
    }

    return textureLoad(pressureTex, p, 0).x;
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
    let sizeU = textureDimensions(velocityTex);

    if (id.x >= sizeU.x || id.y >= sizeU.y) {
        return;
    }

    let p = vec2i(id.xy);

    if (isOuterBoundary(id.xy, sizeU) || isSolidIndex(p, sizeU)) {
        textureStore(velocityOut, vec2i(id.xy), vec4f(0.0, 0.0, 0.0, 1.0));
        return;
    }

    let center = textureLoad(pressureTex, p, 0).x;
    let left = loadPressure(p + vec2i(-1, 0), sizeU, center);
    let right = loadPressure(p + vec2i(1, 0), sizeU, center);
    let top = loadPressure(p + vec2i(0, -1), sizeU, center);
    let bottom = loadPressure(p + vec2i(0, 1), sizeU, center);

    let pressureGradient = vec2f(
        (right - left) / (2.0 * params.dx),
        (bottom - top) / (2.0 * params.dy)
    );

    let projectedVelocity =
        textureLoad(velocityTex, p, 0).xy -
        pressureGradient;

    textureStore(
        velocityOut,
        p,
        vec4f(projectedVelocity, 0.0, 1.0)
    );
}
