@group(0) @binding(0)
var dyeTex: texture_2d<f32>;

@group(0) @binding(1)
var temperatureTex: texture_2d<f32>;

@group(0) @binding(2)
var velocityTex: texture_2d<f32>;

struct RenderParams {
    mode: u32,
    _pad0: u32,
    _pad1: u32,
    _pad2: u32,
}

@group(0) @binding(3)
var<uniform> renderParams: RenderParams;

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

fn renderDye(p: vec2i) -> vec3f {
    let dye = clamp(textureLoad(dyeTex, p, 0).x, 0.0, 1.0);
    let background = vec3f(0.01, 0.016, 0.028);
    let tracer = mix(
        vec3f(0.04, 0.12, 0.20),
        vec3f(0.55, 0.88, 1.0),
        smoothstep(0.0, 1.0, dye)
    );
    let glow = smoothstep(0.1, 1.0, dye) * 0.28;

    return mix(background, tracer, smoothstep(0.0, 0.85, dye))
        + glow * vec3f(0.10, 0.32, 0.75);
}

fn renderTemperature(p: vec2i) -> vec3f {
    let temperature = clamp(textureLoad(temperatureTex, p, 0).x, 0.0, 1.0);
    let background = vec3f(0.01, 0.014, 0.024);
    let cold = vec3f(0.06, 0.18, 0.40);
    let warm = vec3f(0.95, 0.38, 0.08);
    let hot = vec3f(1.0, 0.96, 0.72);

    var color = mix(cold, warm, smoothstep(0.0, 0.65, temperature));
    color = mix(color, hot, smoothstep(0.45, 1.0, temperature));
    color = mix(background, color, smoothstep(0.02, 0.95, temperature));

    let glow = smoothstep(0.35, 1.0, temperature);
    return color + glow * glow * vec3f(0.28, 0.12, 0.02);
}

fn renderVelocity(p: vec2i) -> vec3f {
    let velocity = textureLoad(velocityTex, p, 0).xy;
    let speed = length(velocity);
    let background = vec3f(0.012, 0.015, 0.026);

    var direction = vec2f(0.0);
    if (speed > 1e-5) {
        direction = velocity / speed;
    }

    let directionColor = vec3f(
        0.5 + 0.5 * direction.x,
        0.5 + 0.5 * direction.y,
        0.5 - 0.5 * direction.x
    );
    let intensity = smoothstep(0.0, 0.35, speed);
    let color = mix(background, directionColor * (0.35 + 0.9 * intensity), intensity);

    return color + intensity * intensity * 0.18 * vec3f(0.85, 0.95, 1.0);
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4f {
    let size = textureDimensions(dyeTex);
    let uv = clamp(in.uv, vec2f(0.0), vec2f(0.999999));
    let p = vec2i(uv * vec2f(size));

    var color = vec3f(1.0, 0.0, 1.0);

    if (renderParams.mode == 0u) {
        color = renderDye(p);
    } else if (renderParams.mode == 1u) {
        color = renderTemperature(p);
    } else if (renderParams.mode == 2u) {
        color = renderVelocity(p);
    }

    return vec4f(color, 1.0);
}
