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
var srcTemperature: texture_2d<f32>;

@group(0) @binding(1)
var velocityTex: texture_2d<f32>;

@group(0) @binding(2)
var dstTemperature: texture_storage_2d<rgba32float, write>;

@group(0) @binding(3)
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

fn isHeaterPosition(position: vec2f) -> bool {
    let offset = position - vec2f(params.heaterCenterX, params.heaterCenterY);
    return dot(offset, offset) <= params.heaterRadius * params.heaterRadius;
}

fn isSolidCell(id: vec2u, size: vec2u) -> bool {
    return isOuterBoundary(id, size) || isHeaterPosition(cellCenterPosition(id));
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

    if (isHeaterPosition((vec2f(p) + vec2f(0.5)) * vec2f(params.dx, params.dy))) {
        return params.heaterTemperature;
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

    if (isHeaterPosition(cellCenterPosition(id.xy))) {
        textureStore(
            dstTemperature,
            vec2i(id.xy),
            vec4f(
                params.heaterTemperature,
                params.heaterTemperature,
                params.heaterTemperature,
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
