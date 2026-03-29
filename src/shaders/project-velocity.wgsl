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
var pressureTex: texture_2d<f32>;

@group(0) @binding(1)
var velocityXTex: texture_2d<f32>;

@group(0) @binding(2)
var velocityYTex: texture_2d<f32>;

@group(0) @binding(3)
var velocityXOut: texture_storage_2d<rgba32float, write>;

@group(0) @binding(4)
var velocityYOut: texture_storage_2d<rgba32float, write>;

@group(0) @binding(5)
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

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
    let pressureSize = textureDimensions(pressureTex);
    let velocityXSize = textureDimensions(velocityXTex);
    let velocityYSize = textureDimensions(velocityYTex);

    if (id.x < velocityXSize.x && id.y < velocityXSize.y) {
        let faceId = vec2i(id.xy);

        if (isVelocityXObstacleFace(faceId, velocityXSize, pressureSize)) {
            textureStore(velocityXOut, faceId, vec4f(0.0, 0.0, 0.0, 1.0));
        } else if (isVelocityXBoundaryFace(faceId, velocityXSize)) {
            textureStore(
                velocityXOut,
                faceId,
                vec4f(textureLoad(velocityXTex, faceId, 0).x, 0.0, 0.0, 1.0)
            );
        } else {
            let leftPressure = textureLoad(pressureTex, vec2i(faceId.x - 1, faceId.y), 0).x;
            let rightPressure = textureLoad(pressureTex, vec2i(faceId.x, faceId.y), 0).x;
            let projectedVelocity =
                textureLoad(velocityXTex, faceId, 0).x -
                (rightPressure - leftPressure) / params.dx;

            textureStore(velocityXOut, faceId, vec4f(projectedVelocity, 0.0, 0.0, 1.0));
        }
    }

    if (id.x < velocityYSize.x && id.y < velocityYSize.y) {
        let faceId = vec2i(id.xy);

        if (isVelocityYObstacleFace(faceId, velocityYSize, pressureSize)) {
            textureStore(velocityYOut, faceId, vec4f(0.0, 0.0, 0.0, 1.0));
        } else if (isVelocityYBoundaryFace(faceId, velocityYSize)) {
            textureStore(
                velocityYOut,
                faceId,
                vec4f(textureLoad(velocityYTex, faceId, 0).x, 0.0, 0.0, 1.0)
            );
        } else {
            let topPressure = textureLoad(pressureTex, vec2i(faceId.x, faceId.y - 1), 0).x;
            let bottomPressure = textureLoad(pressureTex, vec2i(faceId.x, faceId.y), 0).x;
            let projectedVelocity =
                textureLoad(velocityYTex, faceId, 0).x -
                (bottomPressure - topPressure) / params.dy;

            textureStore(velocityYOut, faceId, vec4f(projectedVelocity, 0.0, 0.0, 1.0));
        }
    }
}
