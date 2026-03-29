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
var divergenceTex: texture_2d<f32>;

@group(0) @binding(2)
var pressureOut: texture_storage_2d<rgba32float, write>;

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

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
    let sizeU = textureDimensions(pressureTex);

    if (id.x >= sizeU.x || id.y >= sizeU.y) {
        return;
    }

    let p = vec2i(id.xy);

    if (isPressureBoundaryIndex(p, sizeU) || isPressureSolidIndex(p, sizeU)) {
        textureStore(pressureOut, p, vec4f(0.0, 0.0, 0.0, 1.0));
        return;
    }

    let inverseDx2 = 1.0 / (params.dx * params.dx);
    let inverseDy2 = 1.0 / (params.dy * params.dy);
    let divergence = textureLoad(divergenceTex, p, 0).x;

    var weightedPressureSum = 0.0;
    var weight = 0.0;

    let left = p + vec2i(-1, 0);
    if (!isPressureSolidIndex(left, sizeU)) {
        weightedPressureSum = weightedPressureSum + textureLoad(pressureTex, left, 0).x * inverseDx2;
        weight = weight + inverseDx2;
    }

    let right = p + vec2i(1, 0);
    if (!isPressureSolidIndex(right, sizeU)) {
        weightedPressureSum = weightedPressureSum + textureLoad(pressureTex, right, 0).x * inverseDx2;
        weight = weight + inverseDx2;
    }

    let top = p + vec2i(0, -1);
    if (!isPressureSolidIndex(top, sizeU)) {
        weightedPressureSum = weightedPressureSum + textureLoad(pressureTex, top, 0).x * inverseDy2;
        weight = weight + inverseDy2;
    }

    let bottom = p + vec2i(0, 1);
    if (!isPressureSolidIndex(bottom, sizeU)) {
        weightedPressureSum = weightedPressureSum + textureLoad(pressureTex, bottom, 0).x * inverseDy2;
        weight = weight + inverseDy2;
    }

    let candidatePressure = select(
        0.0,
        (weightedPressureSum - divergence) / weight,
        weight > 0.0
    );
    let pressure = mix(textureLoad(pressureTex, p, 0).x, candidatePressure, 0.82);

    textureStore(pressureOut, p, vec4f(pressure, 0.0, 0.0, 1.0));
}
