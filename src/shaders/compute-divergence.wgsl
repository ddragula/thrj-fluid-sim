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
var divergenceOut: texture_storage_2d<rgba32float, write>;

@group(0) @binding(2)
var<uniform> params: Params;


fn loadVelocity(p: vec2i, size: vec2u) -> vec2f {
    if (
        p.x < 0 ||
        p.y < 0 ||
        p.x >= i32(size.x) ||
        p.y >= i32(size.y)
    ) {
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
    let left = loadVelocity(p + vec2i(-1, 0), sizeU);
    let right = loadVelocity(p + vec2i(1, 0), sizeU);
    let top = loadVelocity(p + vec2i(0, -1), sizeU);
    let bottom = loadVelocity(p + vec2i(0, 1), sizeU);

    let divergence =
        (right.x - left.x) / (2.0 * params.dx) +
        (bottom.y - top.y) / (2.0 * params.dy);

    textureStore(divergenceOut, p, vec4f(divergence, 0.0, 0.0, 1.0));
}
