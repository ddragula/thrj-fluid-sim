struct Params {
    time: f32,
    dt: f32,
    width: f32,
    height: f32,
    dx: f32,
    dy: f32,
    ambientTemperature: f32,
    temperatureScale: f32,
    gravity: f32,
    thermalExpansion: f32,
    kinematicViscosity: f32,
    thermalDiffusivity: f32,
    dyeDecayRate: f32,
    heaterTemperature: f32,
    heaterRadiusX: f32,
    heaterRadiusY: f32,
}

@group(0) @binding(0)
var velocityTex: texture_2d<f32>;

@group(0) @binding(1)
var pressureTex: texture_2d<f32>;

@group(0) @binding(2)
var velocityOut: texture_storage_2d<rgba32float, write>;

@group(0) @binding(3)
var<uniform> params: Params;


fn isBoundary(id: vec2u, size: vec2u) -> bool {
    return (
        id.x == 0u ||
        id.y == 0u ||
        id.x + 1u >= size.x ||
        id.y + 1u >= size.y
    );
}

fn loadPressure(p: vec2i, size: vec2u) -> f32 {
    if (
        p.x < 0 ||
        p.y < 0 ||
        p.x >= i32(size.x) ||
        p.y >= i32(size.y)
    ) {
        return 0.0;
    }

    return textureLoad(pressureTex, p, 0).x;
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
    let sizeU = textureDimensions(velocityTex);

    if (id.x >= sizeU.x || id.y >= sizeU.y) {
        return;
    }

    if (isBoundary(id.xy, sizeU)) {
        textureStore(velocityOut, vec2i(id.xy), vec4f(0.0, 0.0, 0.0, 1.0));
        return;
    }

    let p = vec2i(id.xy);
    let left = loadPressure(p + vec2i(-1, 0), sizeU);
    let right = loadPressure(p + vec2i(1, 0), sizeU);
    let top = loadPressure(p + vec2i(0, -1), sizeU);
    let bottom = loadPressure(p + vec2i(0, 1), sizeU);

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
