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
var velocityOut: texture_storage_2d<rgba32float, write>;

@group(0) @binding(3)
var<uniform> params: Params;


fn pressureCellCenter(p: vec2i) -> vec2f {
    return (vec2f(p) + vec2f(0.5)) * vec2f(params.dx, params.dy);
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

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
    let sizeU = textureDimensions(velocityOut);

    if (id.x >= sizeU.x || id.y >= sizeU.y) {
        return;
    }

    let p = vec2i(id.xy);

    if (isPressureSolidIndex(p, sizeU)) {
        textureStore(velocityOut, p, vec4f(0.0, 0.0, 0.0, 1.0));
        return;
    }

    let leftVelocity = textureLoad(velocityXTex, vec2i(p.x, p.y), 0).x;
    let rightVelocity = textureLoad(velocityXTex, vec2i(p.x + 1, p.y), 0).x;
    let topVelocity = textureLoad(velocityYTex, vec2i(p.x, p.y), 0).x;
    let bottomVelocity = textureLoad(velocityYTex, vec2i(p.x, p.y + 1), 0).x;

    textureStore(
        velocityOut,
        p,
        vec4f(
            0.5 * (leftVelocity + rightVelocity),
            0.5 * (topVelocity + bottomVelocity),
            0.0,
            1.0
        )
    );
}
