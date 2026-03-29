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
var divergenceOut: texture_storage_2d<rgba32float, write>;

@group(0) @binding(3)
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
    if (
        id.x < 0 ||
        id.y < 0 ||
        id.x >= i32(velocitySize.x) ||
        id.y >= i32(velocitySize.y)
    ) {
        return 0.0;
    }

    if (isVelocityXObstacleFace(id, velocitySize, pressureSize)) {
        return 0.0;
    }

    return textureLoad(velocityXTex, id, 0).x;
}

fn loadVelocityY(id: vec2i, velocitySize: vec2u, pressureSize: vec2u) -> f32 {
    if (
        id.x < 0 ||
        id.y < 0 ||
        id.x >= i32(velocitySize.x) ||
        id.y >= i32(velocitySize.y)
    ) {
        return 0.0;
    }

    if (isVelocityYObstacleFace(id, velocitySize, pressureSize)) {
        return 0.0;
    }

    return textureLoad(velocityYTex, id, 0).x;
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
    let velocityXSize = textureDimensions(velocityXTex);
    let velocityYSize = textureDimensions(velocityYTex);
    let pressureSize = vec2u(velocityXSize.x - 1u, velocityXSize.y);

    if (id.x >= pressureSize.x || id.y >= pressureSize.y) {
        return;
    }

    let p = vec2i(id.xy);

    if (isPressureBoundaryIndex(p, pressureSize) || isPressureSolidIndex(p, pressureSize)) {
        textureStore(divergenceOut, p, vec4f(0.0, 0.0, 0.0, 1.0));
        return;
    }

    let leftVelocity = loadVelocityX(vec2i(p.x, p.y), velocityXSize, pressureSize);
    let rightVelocity = loadVelocityX(vec2i(p.x + 1, p.y), velocityXSize, pressureSize);
    let topVelocity = loadVelocityY(vec2i(p.x, p.y), velocityYSize, pressureSize);
    let bottomVelocity = loadVelocityY(vec2i(p.x, p.y + 1), velocityYSize, pressureSize);

    let divergence =
        (rightVelocity - leftVelocity) / params.dx +
        (bottomVelocity - topVelocity) / params.dy;

    textureStore(divergenceOut, p, vec4f(divergence, 0.0, 0.0, 1.0));
}
