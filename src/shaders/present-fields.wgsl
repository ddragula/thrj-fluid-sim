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
    ambientTemperature: f32,
    heaterTemperature: f32,
    displayMin: f32,
    displayMax: f32,
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
    let visibleDye = 1.0 - exp(-6.0 * dye);
    let tracer = mix(
        vec3f(0.04, 0.12, 0.20),
        vec3f(0.55, 0.88, 1.0),
        smoothstep(0.0, 1.0, visibleDye)
    );
    let glow = smoothstep(0.02, 0.45, visibleDye) * 0.34;

    return mix(background, tracer, smoothstep(0.0, 0.65, visibleDye))
        + glow * vec3f(0.10, 0.32, 0.75);
}

fn sampleScalarTexture(tex: texture_2d<f32>, uv: vec2f) -> f32 {
    let size = vec2f(textureDimensions(tex));
    let maxIndex = vec2i(textureDimensions(tex)) - vec2i(1);

    let pos = clamp(uv, vec2f(0.0), vec2f(0.999999)) * size - vec2f(0.5);
    let baseFloor = floor(pos);
    let base = vec2i(baseFloor);
    let frac = pos - baseFloor;

    let p00 = clamp(base, vec2i(0), maxIndex);
    let p10 = clamp(base + vec2i(1, 0), vec2i(0), maxIndex);
    let p01 = clamp(base + vec2i(0, 1), vec2i(0), maxIndex);
    let p11 = clamp(base + vec2i(1, 1), vec2i(0), maxIndex);

    let s00 = textureLoad(tex, p00, 0).x;
    let s10 = textureLoad(tex, p10, 0).x;
    let s01 = textureLoad(tex, p01, 0).x;
    let s11 = textureLoad(tex, p11, 0).x;

    let a = mix(s00, s10, frac.x);
    let b = mix(s01, s11, frac.x);

    return mix(a, b, frac.y);
}

fn temperaturePalette(position: f32) -> vec3f {
    // Keep these stops in sync with the temperature legend in the control panel.
    let clampedPosition = clamp(position, 0.0, 1.0);

    let coolBlue = vec3f(0.121, 0.071, 0.776);
    let deepBlue = vec3f(0.161, 0.188, 0.812);
    let violet = vec3f(0.478, 0.200, 0.788);
    let magenta = vec3f(0.788, 0.169, 0.588);
    let red = vec3f(0.937, 0.231, 0.310);
    let orange = vec3f(1.0, 0.396, 0.094);
    let amber = vec3f(1.0, 0.671, 0.114);
    let yellow = vec3f(1.0, 0.898, 0.427);
    let nearWhite = vec3f(1.0, 0.984, 0.824);

    if (clampedPosition <= 0.16) {
        return mix(coolBlue, deepBlue, smoothstep(0.0, 0.16, clampedPosition));
    }

    if (clampedPosition <= 0.32) {
        return mix(deepBlue, violet, smoothstep(0.16, 0.32, clampedPosition));
    }

    if (clampedPosition <= 0.46) {
        return mix(violet, magenta, smoothstep(0.32, 0.46, clampedPosition));
    }

    if (clampedPosition <= 0.58) {
        return mix(magenta, red, smoothstep(0.46, 0.58, clampedPosition));
    }

    if (clampedPosition <= 0.68) {
        return mix(red, orange, smoothstep(0.58, 0.68, clampedPosition));
    }

    if (clampedPosition <= 0.80) {
        return mix(orange, amber, smoothstep(0.68, 0.80, clampedPosition));
    }

    if (clampedPosition <= 0.90) {
        return mix(amber, yellow, smoothstep(0.80, 0.90, clampedPosition));
    }

    return mix(yellow, nearWhite, smoothstep(0.90, 1.0, clampedPosition));
}

fn renderTemperature(uv: vec2f) -> vec3f {
    let temperature = sampleScalarTexture(temperatureTex, uv);
    let displaySpan = max(
        renderParams.displayMax - renderParams.displayMin,
        1e-5
    );
    let normalizedTemperature = clamp(
        (temperature - renderParams.displayMin) / displaySpan,
        0.0,
        1.0
    );
    let bandedTemperature = floor(normalizedTemperature * 20.0 + 0.5) / 20.0;

    return temperaturePalette(bandedTemperature);
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
    let intensity = 1.0 - exp(-18.0 * speed);
    let color = mix(background, directionColor * (0.35 + 0.9 * intensity), intensity);

    return color + intensity * intensity * 0.24 * vec3f(0.85, 0.95, 1.0);
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
        color = renderTemperature(uv);
    } else if (renderParams.mode == 2u) {
        color = renderVelocity(p);
    }

    return vec4f(color, 1.0);
}
