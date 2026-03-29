@group(0) @binding(0)
var fieldTex: texture_2d<f32>;

struct VSOut {
    @builtin(position) position: vec4f,
    @location(0) uv: vec2f
}

@vertex
fn vs(@builtin(vertex_index) index: u32) -> VSOut {
    var positions = array<vec2f, 3>(
        vec2f(-1.0, -3.0),
        vec2f(-1.0, 1.0),
        vec2f(3.0, 1.0)
    );

    let p = positions[index];

    var out: VSOut;
    out.position = vec4f(p, 0.0, 1.0);
    out.uv = p * vec2f(0.5, -0.5) + vec2f(0.5, 0.5);
    return out;
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4f {
    let size = textureDimensions(fieldTex);
    let uv = clamp(in.uv, vec2f(0.0), vec2f(0.999999));
    let p = vec2i(uv * vec2f(size));

    let d = clamp(textureLoad(fieldTex, p, 0).x, 0.0, 1.0);

    let c0 = vec3f(0.015, 0.02, 0.035);
    let c1 = vec3f(0.05, 0.25, 0.65);
    let c2 = vec3f(0.95, 0.45, 0.08);

    var color = mix(c0, c1, smoothstep(0.0, 0.35, d));
    color = mix(color, c2, smoothstep(0.35, 1.0, d));

    let glow = smoothstep(0.55, 1.0, d) * 0.25;
    color = color + glow * vec3f(1.0, 0.35, 0.05);

    return vec4f(color, 1.0);
}
