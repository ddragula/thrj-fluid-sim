@group(0) @binding(0)
var densityTex: texture_2d<f32>;

@group(0) @binding(1)
var temperatureTex: texture_2d<f32>;

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
    let size = textureDimensions(densityTex);
    let uv = clamp(in.uv, vec2f(0.0), vec2f(0.999999));
    let p = vec2i(uv * vec2f(size));

    let d = clamp(textureLoad(densityTex, p, 0).x, 0.0, 1.0);
    let t = clamp(textureLoad(temperatureTex, p, 0).x, 0.0, 1.0);

    let background = vec3f(0.015, 0.02, 0.035);
    let smoke = mix(
        vec3f(0.06, 0.09, 0.14),
        vec3f(0.35, 0.55, 0.95),
        smoothstep(0.0, 0.6, d)
    );

    let heat = mix(
        vec3f(0.25, 0.07, 0.02),
        vec3f(1.0, 0.55, 0.08),
        smoothstep(0.0, 1.0, t)
    );

    var color = mix(background, smoke, smoothstep(0.0, 0.9, d));
    color = mix(color, heat, smoothstep(0.05, 1.0, t) * 0.75);

    let glow = smoothstep(0.4, 1.0, t) * 0.22;
    color = color + glow * vec3f(1.0, 0.35, 0.06);

    return vec4f(color, 1.0);
}
