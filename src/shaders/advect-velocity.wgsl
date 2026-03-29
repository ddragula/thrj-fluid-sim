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
var srcVelocity: texture_2d<f32>;

@group(0) @binding(1)
var dstVelocity: texture_storage_2d<rgba32float, write>;

@group(0) @binding(2)
var<uniform> params: Params;


fn isBoundary(id: vec2u, size: vec2u) -> bool {
    return (
        id.x == 0u ||
        id.y == 0u ||
        id.x + 1u >= size.x ||
        id.y + 1u >= size.y
    );
}

fn loadVelocity(p: vec2i, size: vec2u) -> vec2f {
    if (
        p.x < 0 ||
        p.y < 0 ||
        p.x >= i32(size.x) ||
        p.y >= i32(size.y)
    ) {
        return vec2f(0.0);
    }

    return textureLoad(srcVelocity, p, 0).xy;
}

fn sampleVelocity(uv: vec2f) -> vec2f {
    let size = vec2f(textureDimensions(srcVelocity));
    let maxIndex = vec2i(textureDimensions(srcVelocity)) - vec2i(1);

    let pos = clamp(uv, vec2f(0.0), vec2f(0.999999)) * size - vec2f(0.5);
    let baseFloor = floor(pos);
    let base = vec2i(baseFloor);
    let frac = pos - baseFloor;

    let p00 = clamp(base, vec2i(0), maxIndex);
    let p10 = clamp(base + vec2i(1, 0), vec2i(0), maxIndex);
    let p01 = clamp(base + vec2i(0, 1), vec2i(0), maxIndex);
    let p11 = clamp(base + vec2i(1, 1), vec2i(0), maxIndex);

    let v00 = textureLoad(srcVelocity, p00, 0).xy;
    let v10 = textureLoad(srcVelocity, p10, 0).xy;
    let v01 = textureLoad(srcVelocity, p01, 0).xy;
    let v11 = textureLoad(srcVelocity, p11, 0).xy;

    let a = mix(v00, v10, frac.x);
    let b = mix(v01, v11, frac.x);

    return mix(a, b, frac.y);
}

fn velocityLaplacian(p: vec2i, size: vec2u) -> vec2f {
    let center = loadVelocity(p, size);
    let left = loadVelocity(p + vec2i(-1, 0), size);
    let right = loadVelocity(p + vec2i(1, 0), size);
    let top = loadVelocity(p + vec2i(0, -1), size);
    let bottom = loadVelocity(p + vec2i(0, 1), size);

    let ddx = (left - 2.0 * center + right) / (params.dx * params.dx);
    let ddy = (top - 2.0 * center + bottom) / (params.dy * params.dy);

    return ddx + ddy;
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
    let sizeU = textureDimensions(srcVelocity);

    if (id.x >= sizeU.x || id.y >= sizeU.y) {
        return;
    }

    if (isBoundary(id.xy, sizeU)) {
        textureStore(dstVelocity, vec2i(id.xy), vec4f(0.0, 0.0, 0.0, 1.0));
        return;
    }

    let size = vec2f(sizeU);
    let uv = (vec2f(id.xy) + vec2f(0.5)) / size;
    let velocity = textureLoad(srcVelocity, vec2i(id.xy), 0).xy;
    let prevUv = uv - velocity * params.dt;

    var advectedVelocity = sampleVelocity(prevUv);
    advectedVelocity =
        advectedVelocity +
        params.kinematicViscosity * params.dt * velocityLaplacian(vec2i(id.xy), sizeU);

    textureStore(
        dstVelocity,
        vec2i(id.xy),
        vec4f(advectedVelocity, 0.0, 1.0)
    );
}
