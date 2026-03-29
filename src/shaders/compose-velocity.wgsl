struct Params {
    time: f32,
    dt: f32,
    width: f32,
    height: f32
}

@group(0) @binding(0)
var temperatureTex: texture_2d<f32>;

@group(0) @binding(1)
var velocityOut: texture_storage_2d<rgba32float, write>;

@group(0) @binding(2)
var<uniform> params: Params;


@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
    let sizeU = textureDimensions(temperatureTex);

    if (id.x >= sizeU.x || id.y >= sizeU.y) {
        return;
    }

    let uv = (vec2f(id.xy) + vec2f(0.5)) / vec2f(sizeU);

    let nozzleX = 0.5 + 0.03 * sin(params.time * 0.7);
    let dx = uv.x - nozzleX;

    let core = exp(-dx * dx * 90.0);
    let envelope = 0.2 + 0.8 * core;

    let baseVy = -0.20 * envelope;
    let baseVx = 0.08 * sin(params.time * 1.1 + uv.y * 8.0) * core;

    let temp = textureLoad(temperatureTex, vec2i(id.xy), 0).x;

    let ambient = 0.0f;
    let buoyancyStrength = 1.15;

    let buoyancyVy = -buoyancyStrength * max(temp - ambient, 0.0);
    
    let vx = baseVx;
    let vy = baseVy + buoyancyVy;

    textureStore(velocityOut, vec2i(id.xy), vec4f(vx, vy, 0.0, 1.0));
}
