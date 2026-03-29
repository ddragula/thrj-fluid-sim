@group(0) @binding(0)
var dyeTex: texture_2d<f32>;

@group(0) @binding(1)
var temperatureTex: texture_2d<f32>;

@group(0) @binding(2)
var velocityTex: texture_2d<f32>;

const DOMAIN_ELEMENT_TYPE_NONE: u32 = 0u;
const DOMAIN_ELEMENT_TYPE_AMBIENT_WALL: u32 = 1u;
const DOMAIN_ELEMENT_TYPE_HOT_CIRCLE: u32 = 2u;
const MAX_DOMAIN_ELEMENTS: u32 = 32u;
const DOMAIN_ELEMENT_DYNAMIC_TEMPERATURE_THRESHOLD: f32 = -1e29;

struct DomainElement {
    kind: u32,
    _pad0: u32,
    _pad1: u32,
    _pad2: u32,
    data0: vec4f,
    data1: vec4f,
}

struct RenderParams {
    mode: u32,
    _pad0: u32,
    _pad1: u32,
    _pad2: u32,
    ambientTemperature: f32,
    heaterTemperature: f32,
    displayMin: f32,
    displayMax: f32,
    viewportAspectRatio: f32,
    domainAspectRatio: f32,
    cameraCenterX: f32,
    cameraCenterY: f32,
    cameraZoom: f32,
    domainWidthMeters: f32,
    domainHeightMeters: f32,
    _pad4: f32,
}

struct VSOut {
    @builtin(position) position: vec4f,
    @location(0) uv: vec2f,
}

struct DomainSample {
    inside: bool,
    uv: vec2f,
}

struct SolidSample {
    isSolid: bool,
    temperature: f32,
}

@group(0) @binding(3)
var<storage, read> domainElements: array<DomainElement, MAX_DOMAIN_ELEMENTS>;

@group(0) @binding(4)
var<uniform> renderParams: RenderParams;

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

fn temperaturePalette(position: f32) -> vec3f {
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

fn renderTemperatureValue(temperature: f32) -> vec3f {
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

fn renderTemperature(p: vec2i) -> vec3f {
    return renderTemperatureValue(textureLoad(temperatureTex, p, 0).x);
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

fn distanceToSegment(point: vec2f, start: vec2f, end: vec2f) -> f32 {
    let delta = end - start;
    let lengthSquared = max(dot(delta, delta), 1e-12);
    let t = clamp(dot(point - start, delta) / lengthSquared, 0.0, 1.0);
    let closest = start + t * delta;

    return distance(point, closest);
}

fn getSolidSample(position: vec2f) -> SolidSample {
    for (var index = 0u; index < MAX_DOMAIN_ELEMENTS; index = index + 1u) {
        let element = domainElements[index];

        if (element.kind == DOMAIN_ELEMENT_TYPE_NONE) {
            continue;
        }

        if (element.kind == DOMAIN_ELEMENT_TYPE_AMBIENT_WALL) {
            if (distanceToSegment(position, element.data0.xy, element.data0.zw) <= 0.5 * element.data1.x) {
                return SolidSample(true, renderParams.ambientTemperature);
            }

            continue;
        }

        if (element.kind == DOMAIN_ELEMENT_TYPE_HOT_CIRCLE) {
            let offset = position - element.data0.xy;

            if (dot(offset, offset) <= element.data0.z * element.data0.z) {
                let hotTemperature = select(
                    element.data0.w,
                    renderParams.heaterTemperature,
                    element.data0.w <= DOMAIN_ELEMENT_DYNAMIC_TEMPERATURE_THRESHOLD
                );

                return SolidSample(true, hotTemperature);
            }
        }
    }

    return SolidSample(false, renderParams.ambientTemperature);
}

fn renderSolid(temperature: f32) -> vec3f {
    if (temperature > renderParams.ambientTemperature + 0.5) {
        if (renderParams.mode == 1u) {
            return renderTemperatureValue(temperature);
        }

        return vec3f(0.94, 0.90, 0.78);
    }

    return vec3f(0.12, 0.15, 0.18);
}

fn mapViewportUvToDomainUv(uv: vec2f) -> DomainSample {
    let viewportAspectRatio = max(renderParams.viewportAspectRatio, 1e-5);
    let domainAspectRatio = max(renderParams.domainAspectRatio, 1e-5);
    let zoom = max(renderParams.cameraZoom, 1e-5);
    let center = vec2f(renderParams.cameraCenterX, renderParams.cameraCenterY);
    var visibleSize = vec2f(1.0, 1.0);

    if (viewportAspectRatio > domainAspectRatio) {
        visibleSize = vec2f(viewportAspectRatio / domainAspectRatio, 1.0);
    } else {
        visibleSize = vec2f(1.0, domainAspectRatio / viewportAspectRatio);
    }

    let scaledVisibleSize = visibleSize / zoom;
    let domainUv = center + (uv - vec2f(0.5, 0.5)) * scaledVisibleSize;

    return DomainSample(
        all(domainUv >= vec2f(0.0)) && all(domainUv <= vec2f(1.0)),
        clamp(domainUv, vec2f(0.0), vec2f(0.999999))
    );
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4f {
    let background = vec3f(0.02, 0.025, 0.035);
    let size = textureDimensions(dyeTex);
    let domainSample = mapViewportUvToDomainUv(in.uv);

    if (!domainSample.inside) {
        return vec4f(background, 1.0);
    }

    let uv = domainSample.uv;
    let positionMeters = uv * vec2f(renderParams.domainWidthMeters, renderParams.domainHeightMeters);
    let solid = getSolidSample(positionMeters);

    if (solid.isSolid) {
        return vec4f(renderSolid(solid.temperature), 1.0);
    }

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
