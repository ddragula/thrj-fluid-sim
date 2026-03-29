struct Globals {
    time: f32,
    width: f32,
    height: f32,
    _pad: f32,
}

@group(0) @binding(0)
var<uniform> globals: Globals;

struct VSOut {
    @builtin(position) position: vec4f,
    @location(0) uv: vec2f,
}

@vertex
fn vs(@builtin(vertex_index) index: u32) -> VSOut {
    var positions = array<vec2f, 3>(
        vec2f(-1.0, -3.0),
        vec2f(-1.0,  1.0),
        vec2f( 3.0,  1.0)
    );

    let p = positions[index];

    var out: VSOut;
    out.position = vec4f(p, 0.0, 1.0);
    out.uv = p * vec2f(0.5, -0.5) + vec2f(0.5, 0.5);
    return out;
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4f {
    let aspect = globals.width / max(globals.height, 1.0);
    let uv = in.uv;

    let x = (uv.x - 0.5) * aspect;
    let y = uv.y - 0.5;
    let r2 = x * x + y * y;

    let glow = 0.12 / (0.05 + r2);
    let t = globals.time;

    let wave = vec3f(
        0.5 + 0.5 * sin(t + x * 5.0 + y * 2.0),
        0.5 + 0.5 * sin(t * 1.3 + x * 2.0 - y * 4.0 + 1.2),
        0.5 + 0.5 * sin(t * 0.8 - x * 3.0 + y * 3.5 + 2.4)
    );

    let base = vec3f(0.03, 0.05, 0.08);
    let color = base + glow * wave;

    return vec4f(color, 1.0);
}
