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
var temperatureTex: texture_2d<f32>;

@group(0) @binding(1)
var srcVelocity: texture_2d<f32>;

@group(0) @binding(2)
var dstVelocity: texture_storage_2d<rgba32float, write>;

@group(0) @binding(3)
var<uniform> params: Params;


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

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
    let sizeU = textureDimensions(srcVelocity);

    if (id.x >= sizeU.x || id.y >= sizeU.y) {
        return;
    }

    if (isSolidCell(id.xy, sizeU)) {
        textureStore(dstVelocity, vec2i(id.xy), vec4f(0.0, 0.0, 0.0, 1.0));
        return;
    }

    let velocity = textureLoad(srcVelocity, vec2i(id.xy), 0).xy;
    let temperature = textureLoad(temperatureTex, vec2i(id.xy), 0).x;
    let deltaTemperature = max(temperature - params.ambientTemperature, 0.0);
    let buoyancyAcceleration =
        params.gravity *
        params.thermalExpansion *
        deltaTemperature;

    let buoyantVelocity = vec2f(velocity.x, velocity.y - params.dt * buoyancyAcceleration);

    textureStore(
        dstVelocity,
        vec2i(id.xy),
        vec4f(buoyantVelocity, 0.0, 1.0)
    );
}
