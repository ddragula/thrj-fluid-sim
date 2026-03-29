struct Params {
    time: f32,
    dt: f32,
    width: f32,
    height: f32
}

@group(0) @binding(0)
var velOut: texture_storage_2d<rgba32float, write>;

@group(0) @binding(1)
var<uniform> params: Params;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
    let size = textureDimensions(velOut);

    if (id.x >= size.x || id.y >= size.y) {
        return;
    }

    let uv = (vec2f(id.xy) + vec2f(0.5)) / vec2f(size);

    let nozzleX = 0.5 + 0.05 * sin(params.time * 0.7);
    let dx = uv.x - nozzleX;

    let core = exp(-dx * dx * 90.0);
    let envelope = 0.25 + 0.75 * core;
    let vy = -0.55 * envelope;
    let vx = 0.12 * sin(params.time * 1.1 + uv.y * 8.0) * core;
    
    textureStore(velOut, vec2i(id.xy), vec4f(vx, vy, 0.0, 1.0));
}
