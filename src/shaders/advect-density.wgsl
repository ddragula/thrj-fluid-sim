struct Params {
    time: f32,
    dt: f32,
    width: f32,
    height: f32,
}

@group(0) @binding(0)
var srcDensity: texture_2d<f32>;

@group(0) @binding(1)
var velocityTex: texture_2d<f32>;

@group(0) @binding(2)
var dstDensity: texture_storage_2d<rgba8unorm, write>;

@group(0) @binding(3)
var<uniform> params: Params;


fn sampleDensity(uv: vec2f) -> f32 {
    let size = vec2f(textureDimensions(srcDensity));
    let maxIndex = vec2i(textureDimensions(srcDensity)) - vec2i(1);

    let pos = clamp(uv, vec2f(0.0), vec2f(0.999999)) * size - vec2f(0.5);
    let baseFloor = floor(pos);
    let base = vec2i(baseFloor);
    let frac = pos - baseFloor;

    let p00 = clamp(base, vec2i(0), maxIndex);
    let p10 = clamp(base + vec2i(1, 0), vec2i(0), maxIndex);
    let p01 = clamp(base + vec2i(0, 1), vec2i(0), maxIndex);
    let p11 = clamp(base + vec2i(1, 1), vec2i(0), maxIndex);

    let d00 = textureLoad(srcDensity, p00, 0).x;
    let d10 = textureLoad(srcDensity, p10, 0).x;
    let d01 = textureLoad(srcDensity, p01, 0).x;
    let d11 = textureLoad(srcDensity, p11, 0).x;

    let a = mix(d00, d10, frac.x);
    let b = mix(d01, d11, frac.x);

    return mix(a, b, frac.y);
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
    let sizeU = textureDimensions(srcDensity);

    if (id.x >= sizeU.x || id.y >= sizeU.y) {
        return;
    }

    let size = vec2f(sizeU);
    let uv = (vec2f(id.xy) + vec2f(0.5)) / size;

    let vel = textureLoad(velocityTex, vec2i(id.xy), 0).xy;

    let prevUv = uv - vel * params.dt;

    var density = sampleDensity(prevUv);

    density = density * 0.997;

    let sourceCenter = vec2f(
        0.5 + 0.03 * sin(params.time * 0.7),
        0.92
    );

    let q = uv - sourceCenter;

    let source = exp(-(q.x * q.x * 900.0 + q.y * q.y * 9000.0));

    density = clamp(density + 4.2 * params.dt * source, 0.0, 1.0);

    textureStore(dstDensity, vec2i(id.xy), vec4f(density, density, density, 1.0));
}
