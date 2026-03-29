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
    heaterRadiusX: f32,
    heaterRadiusY: f32,
    _pad0: f32,
}

@group(0) @binding(0)
var srcDye: texture_2d<f32>;

@group(0) @binding(1)
var velocityTex: texture_2d<f32>;

@group(0) @binding(2)
var dstDye: texture_storage_2d<rgba8unorm, write>;

@group(0) @binding(3)
var<uniform> params: Params;


fn sampleDye(uv: vec2f) -> f32 {
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

fn isBoundary(id: vec2u, size: vec2u) -> bool {
    return (
        id.x == 0u ||
        id.y == 0u ||
        id.x + 1u >= size.x ||
        id.y + 1u >= size.y
    );
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
    let sizeU = textureDimensions(srcDye);

    if (id.x >= sizeU.x || id.y >= sizeU.y) {
        return;
    }

    if (isBoundary(id.xy, sizeU)) {
        textureStore(dstDye, vec2i(id.xy), vec4f(0.0, 0.0, 0.0, 1.0));
        return;
    }

    let size = vec2f(sizeU);
    let uv = (vec2f(id.xy) + vec2f(0.5)) / size;

    let vel = textureLoad(velocityTex, vec2i(id.xy), 0).xy;
    let prevUv = uv - vel * params.dt;

    var dye = sampleDye(prevUv);

    dye = dye * max(0.0, 1.0 - params.dyeDecayRate * params.dt);

    let emitterCenter = vec2f(0.5, 0.94);
    let q = uv - emitterCenter;
    let emitter = exp(
        -0.5 * (
            (q.x * q.x) / (params.heaterRadiusX * params.heaterRadiusX * 1.4) +
            (q.y * q.y) / (params.heaterRadiusY * params.heaterRadiusY * 0.85)
        )
    );

    dye = clamp(dye + 4.5 * params.dt * emitter, 0.0, 1.0);

    textureStore(dstDye, vec2i(id.xy), vec4f(dye, dye, dye, 1.0));
}
