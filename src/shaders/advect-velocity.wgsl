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
var velocityXTex: texture_2d<f32>;

@group(0) @binding(1)
var velocityYTex: texture_2d<f32>;

@group(0) @binding(2)
var velocityXOut: texture_storage_2d<rgba32float, write>;

@group(0) @binding(3)
var velocityYOut: texture_storage_2d<rgba32float, write>;

@group(0) @binding(4)
var<uniform> params: Params;


fn pressureCellCenter(p: vec2i) -> vec2f {
    return (vec2f(p) + vec2f(0.5)) * vec2f(params.dx, params.dy);
}

fn isPressureBoundaryIndex(p: vec2i, size: vec2u) -> bool {
    return (
        p.x == 0 ||
        p.y == 0 ||
        p.x + 1 >= i32(size.x) ||
        p.y + 1 >= i32(size.y)
    );
}

fn velocityXFaceCenter(id: vec2i) -> vec2f {
    return vec2f(f32(id.x) * params.dx, (f32(id.y) + 0.5) * params.dy);
}

fn velocityYFaceCenter(id: vec2i) -> vec2f {
    return vec2f((f32(id.x) + 0.5) * params.dx, f32(id.y) * params.dy);
}

fn isHeaterPosition(position: vec2f) -> bool {
    let offset = position - vec2f(params.heaterCenterX, params.heaterCenterY);
    return dot(offset, offset) <= params.heaterRadius * params.heaterRadius;
}

fn isPressureSolidIndex(p: vec2i, size: vec2u) -> bool {
    if (
        p.x < 0 ||
        p.y < 0 ||
        p.x >= i32(size.x) ||
        p.y >= i32(size.y)
    ) {
        return true;
    }

    return isHeaterPosition(pressureCellCenter(p));
}

fn isVelocityXBoundaryFace(id: vec2i, velocitySize: vec2u) -> bool {
    return id.x == 0 || id.x + 1 >= i32(velocitySize.x);
}

fn isVelocityYBoundaryFace(id: vec2i, velocitySize: vec2u) -> bool {
    return id.y == 0 || id.y + 1 >= i32(velocitySize.y);
}

fn isVelocityXObstacleFace(id: vec2i, velocitySize: vec2u, pressureSize: vec2u) -> bool {
    if (
        id.x < 0 ||
        id.y < 0 ||
        id.x >= i32(velocitySize.x) ||
        id.y >= i32(velocitySize.y)
    ) {
        return true;
    }

    let leftCell = vec2i(id.x - 1, id.y);
    let rightCell = vec2i(id.x, id.y);

    return (
        !isPressureBoundaryIndex(leftCell, pressureSize) &&
        !isPressureBoundaryIndex(rightCell, pressureSize) &&
        (
            isPressureSolidIndex(leftCell, pressureSize) ||
            isPressureSolidIndex(rightCell, pressureSize)
        )
    );
}

fn isVelocityYObstacleFace(id: vec2i, velocitySize: vec2u, pressureSize: vec2u) -> bool {
    if (
        id.x < 0 ||
        id.y < 0 ||
        id.x >= i32(velocitySize.x) ||
        id.y >= i32(velocitySize.y)
    ) {
        return true;
    }

    let topCell = vec2i(id.x, id.y - 1);
    let bottomCell = vec2i(id.x, id.y);

    return (
        !isPressureBoundaryIndex(topCell, pressureSize) &&
        !isPressureBoundaryIndex(bottomCell, pressureSize) &&
        (
            isPressureSolidIndex(topCell, pressureSize) ||
            isPressureSolidIndex(bottomCell, pressureSize)
        )
    );
}

fn loadVelocityX(id: vec2i, velocitySize: vec2u, pressureSize: vec2u) -> f32 {
    if (id.y < 0 || id.y >= i32(velocitySize.y)) {
        return 0.0;
    }

    let clampedId = vec2i(clamp(id.x, 0, i32(velocitySize.x) - 1), id.y);

    if (isVelocityXObstacleFace(clampedId, velocitySize, pressureSize)) {
        return 0.0;
    }

    return textureLoad(velocityXTex, clampedId, 0).x;
}

fn loadVelocityY(id: vec2i, velocitySize: vec2u, pressureSize: vec2u) -> f32 {
    if (id.x < 0 || id.x >= i32(velocitySize.x)) {
        return 0.0;
    }

    let clampedId = vec2i(id.x, clamp(id.y, 0, i32(velocitySize.y) - 1));

    if (isVelocityYObstacleFace(clampedId, velocitySize, pressureSize)) {
        return 0.0;
    }

    return textureLoad(velocityYTex, clampedId, 0).x;
}

fn sampleScalar(tex: texture_2d<f32>, sampleIndex: vec2f) -> f32 {
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

fn sampleVelocityX(position: vec2f) -> f32 {
    return sampleScalar(
        velocityXTex,
        vec2f(position.x / params.dx, position.y / params.dy - 0.5)
    );
}

fn sampleVelocityY(position: vec2f) -> f32 {
    return sampleScalar(
        velocityYTex,
        vec2f(position.x / params.dx - 0.5, position.y / params.dy)
    );
}

fn sampleVelocity(position: vec2f) -> vec2f {
    return vec2f(sampleVelocityX(position), sampleVelocityY(position));
}

fn velocityXLaplacian(id: vec2i, velocitySize: vec2u, pressureSize: vec2u) -> f32 {
    let center = loadVelocityX(id, velocitySize, pressureSize);
    let left = loadVelocityX(id + vec2i(-1, 0), velocitySize, pressureSize);
    let right = loadVelocityX(id + vec2i(1, 0), velocitySize, pressureSize);
    let top = loadVelocityX(id + vec2i(0, -1), velocitySize, pressureSize);
    let bottom = loadVelocityX(id + vec2i(0, 1), velocitySize, pressureSize);

    let ddx = (left - 2.0 * center + right) / (params.dx * params.dx);
    let ddy = (top - 2.0 * center + bottom) / (params.dy * params.dy);

    return ddx + ddy;
}

fn velocityYLaplacian(id: vec2i, velocitySize: vec2u, pressureSize: vec2u) -> f32 {
    let center = loadVelocityY(id, velocitySize, pressureSize);
    let left = loadVelocityY(id + vec2i(-1, 0), velocitySize, pressureSize);
    let right = loadVelocityY(id + vec2i(1, 0), velocitySize, pressureSize);
    let top = loadVelocityY(id + vec2i(0, -1), velocitySize, pressureSize);
    let bottom = loadVelocityY(id + vec2i(0, 1), velocitySize, pressureSize);

    let ddx = (left - 2.0 * center + right) / (params.dx * params.dx);
    let ddy = (top - 2.0 * center + bottom) / (params.dy * params.dy);

    return ddx + ddy;
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
    let velocityXSize = textureDimensions(velocityXTex);
    let velocityYSize = textureDimensions(velocityYTex);
    let pressureSize = vec2u(velocityXSize.x - 1u, velocityXSize.y);

    if (id.x < velocityXSize.x && id.y < velocityXSize.y) {
        let faceId = vec2i(id.xy);

        if (isVelocityXObstacleFace(faceId, velocityXSize, pressureSize)) {
            textureStore(velocityXOut, faceId, vec4f(0.0, 0.0, 0.0, 1.0));
        } else {
            let position = velocityXFaceCenter(faceId);
            let previousPosition = position - sampleVelocity(position) * params.dt;
            let advectedVelocity =
                sampleVelocityX(previousPosition) +
                params.kinematicViscosity *
                params.dt *
                velocityXLaplacian(faceId, velocityXSize, pressureSize);

            textureStore(velocityXOut, faceId, vec4f(advectedVelocity, 0.0, 0.0, 1.0));
        }
    }

    if (id.x < velocityYSize.x && id.y < velocityYSize.y) {
        let faceId = vec2i(id.xy);

        if (isVelocityYObstacleFace(faceId, velocityYSize, pressureSize)) {
            textureStore(velocityYOut, faceId, vec4f(0.0, 0.0, 0.0, 1.0));
        } else {
            let position = velocityYFaceCenter(faceId);
            let previousPosition = position - sampleVelocity(position) * params.dt;
            let advectedVelocity =
                sampleVelocityY(previousPosition) +
                params.kinematicViscosity *
                params.dt *
                velocityYLaplacian(faceId, velocityYSize, pressureSize);

            let dampedVelocity = select(
                advectedVelocity,
                advectedVelocity * 0.96,
                isVelocityYBoundaryFace(faceId, velocityYSize)
            );

            textureStore(velocityYOut, faceId, vec4f(dampedVelocity, 0.0, 0.0, 1.0));
        }
    }
}
