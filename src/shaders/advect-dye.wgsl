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
var srcDye: texture_2d<f32>;

@group(0) @binding(1)
var velocityXTex: texture_2d<f32>;

@group(0) @binding(2)
var velocityYTex: texture_2d<f32>;

@group(0) @binding(3)
var dstDye: texture_storage_2d<rgba32float, write>;

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

fn sampleFaceScalar(tex: texture_2d<f32>, sampleIndex: vec2f) -> f32 {
    let maxIndex = vec2i(textureDimensions(tex)) - vec2i(1);
    let baseFloor = floor(sampleIndex);
    let base = vec2i(baseFloor);
    let frac = sampleIndex - baseFloor;

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

fn sampleVelocityX(position: vec2f) -> f32 {
    return sampleFaceScalar(
        velocityXTex,
        vec2f(position.x / params.dx, position.y / params.dy - 0.5)
    );
}

fn sampleVelocityY(position: vec2f) -> f32 {
    return sampleFaceScalar(
        velocityYTex,
        vec2f(position.x / params.dx - 0.5, position.y / params.dy)
    );
}

fn sampleVelocity(position: vec2f) -> vec2f {
    return vec2f(sampleVelocityX(position), sampleVelocityY(position));
}

fn distanceToSegment(point: vec2f, a: vec2f, b: vec2f) -> f32 {
    let ab = b - a;
    let abLengthSquared = max(dot(ab, ab), 1e-8);
    let t = clamp(dot(point - a, ab) / abLengthSquared, 0.0, 1.0);
    let closestPoint = a + t * ab;

    return distance(point, closestPoint);
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

    if (isHeaterPosition(position)) {
        textureStore(dstDye, vec2i(id.xy), vec4f(0.0, 0.0, 0.0, 1.0));
        return;
    }

    let previousPosition = position - sampleVelocity(position) * params.dt;
    let previousUv = previousPosition / domainSizeMeters();

    var dye = sampleDye(previousUv);
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
