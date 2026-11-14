/**
 * Volumetric flame rendered with raymarching in a single WebGL 1 fragment shader (no external libraries).
 *
 * Model (qualitative, see FlamePhysicsVisualizer for the physics notes):
 *  - g = 1: filled, teardrop-shaped emitting volume, advected upward by 3D fBm noise; blackbody-like soot palette
 *    with a blue reaction zone at the base.
 *  - g = 0: emission concentrated in a thin spherical shell at a standoff distance from the droplet (fuel vapour
 *    diffuses out, oxygen in); slow radial "breathing" noise; blue chemiluminescence palette.
 *  - In between, the shape and palette are interpolated (no partial-gravity data exist in NASA PSI).
 */
import type { FlameRenderer } from "./types";

const VERT = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec2 u_resolution;
uniform float u_time;
uniform float u_gravity;
uniform vec2 u_mouse;      // x = yaw, y = pitch (radians)
uniform float u_steps;     // raymarch steps actually used (adaptive, <= MAX_STEPS)

// ---- 3D simplex noise: Ian McEwan / Ashima Arts (MIT License) -------------------------
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0))
                   + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
// -------------------------------------------------------------------------------------------

float fbm(vec3 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++) {             // 3 octaves: enough detail, cheaper on integrated GPUs
    s += a * snoise(p);
    p = p * 2.03 + vec3(1.7, 9.2, 3.1);
    a *= 0.5;
  }
  return s;            // roughly in [-0.9, 0.9]
}

const float R0 = 0.55;       // flame (standoff) radius
const float STRETCH = 2.2;   // vertical elongation of the upper half at 1 g
const float DROP = 0.09;     // droplet / wick radius

// x = emission density, y = temperature-like value in [0,1]
vec2 flame(vec3 p) {
  float g = u_gravity;
  float k = smoothstep(0.0, 0.45, g);
  vec3 q = p;
  float top = R0 * (1.0 + STRETCH * g);
  float yN = clamp(max(q.y, 0.0) / top, 0.0, 1.0);
  q.y = q.y > 0.0 ? q.y / (1.0 + STRETCH * g) : q.y / (1.0 - 0.25 * g);
  q.xz /= max(1.0 - 0.85 * g * pow(yN, 1.5), 0.05);   // taper towards the tip
  q.xz /= 1.0 - 0.22 * g;                             // narrower body on Earth
  float r = length(q);

  // Early exit before the (expensive) noise: most samples in the bounding volume are empty.
  // Noise can push the body edge out by at most ~0.32 and the shell is negligible beyond ~4 widths.
  float shellOut = abs(r - R0) - 0.30;    // shell half-width <= ~0.1; exp(-s*s) < 1e-4 beyond 3 widths
  float bodyOut = r - (R0 + 0.34);
  if ((shellOut > 0.0 || k > 0.999) && (bodyOut > 0.0 || k < 0.001)) return vec2(0.0);

  // turbulence: upward advection on Earth, slow radial breathing in microgravity
  vec3 adv = p * 2.3 + vec3(0.0, -u_time * (0.35 + 2.4 * g), 0.0);
  vec3 rad = normalize(p + vec3(1e-4)) * 1.8 + vec3(0.0, 0.0, u_time * 0.12) - vec3(length(p) * 0.6 - u_time * 0.08);
  float n = fbm(mix(rad, adv, g));

  // 1 g: filled body with a ragged, licking edge (strongest towards the tip)
  float edge = R0 + n * (0.07 + 0.25 * g * yN);
  float body = 1.0 - smoothstep(edge - 0.2, edge, r);
  body *= 1.0 - smoothstep(0.75, 1.0, yN) * 0.6;

  // 0 g: thin spherical reaction shell at the standoff distance (stretches with g in the transition)
  float w = 0.075 + 0.025 * n;
  float s = (r - R0) / w;                      // deformed with gravity, like the body
  float shell = exp(-s * s) * (0.7 + 0.45 * n);

  float dens = mix(shell, body, k);
  float temp = mix(0.75 + 0.2 * n, clamp(1.05 - r / R0 * 0.75 - yN * 0.55 + n * 0.25, 0.0, 1.0), k);
  return vec2(max(dens, 0.0), temp);
}

vec3 sootColor(float t) {   // blackbody-like: deep red -> orange -> yellow -> near white
  vec3 c = mix(vec3(0.40, 0.04, 0.0), vec3(1.0, 0.32, 0.02), smoothstep(0.0, 0.4, t));
  c = mix(c, vec3(1.0, 0.72, 0.22), smoothstep(0.35, 0.75, t));
  return mix(c, vec3(1.0, 0.96, 0.84), smoothstep(0.78, 1.0, t));
}
vec3 chemiColor(float t) {  // violet-blue -> cyan (#4cc9f0) -> pale blue-white
  vec3 c = mix(vec3(0.22, 0.16, 0.78), vec3(0.30, 0.79, 0.94), smoothstep(0.25, 0.8, t));
  return mix(c, vec3(0.80, 0.93, 1.0), smoothstep(0.9, 1.1, t));
}

bool sphere(vec3 ro, vec3 rd, vec3 c, float rad, out float t0, out float t1) {
  vec3 oc = ro - c;
  float b = dot(oc, rd);
  float h = b * b - (dot(oc, oc) - rad * rad);
  t0 = 0.0; t1 = -1.0;
  if (h < 0.0) return false;
  h = sqrt(h);
  t0 = -b - h; t1 = -b + h;
  return t1 > 0.0;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float g = u_gravity;
  float k = smoothstep(0.0, 0.45, g);

  vec3 ta = vec3(0.0, 0.62 * g, 0.0);
  float dist = 3.7 + 0.55 * g;
  float yaw = u_mouse.x, pitch = u_mouse.y;
  vec3 ro = ta + dist * vec3(cos(pitch) * sin(yaw), sin(pitch), cos(pitch) * cos(yaw));
  vec3 f = normalize(ta - ro);
  vec3 rgt = normalize(cross(vec3(0.0, 1.0, 0.0), f));
  vec3 up = cross(f, rgt);
  vec3 rd = normalize(uv.x * rgt + uv.y * up + 1.6 * f);

  vec3 col = vec3(0.0);
  float trans = 1.0;
  float t0, t1, d0, d1;
  bool hitDrop = sphere(ro, rd, vec3(0.0), DROP, d0, d1) && d0 > 0.0;
  if (sphere(ro, rd, vec3(0.0, 0.6 * g, 0.0), 0.92 + 0.85 * g, t0, t1)) {
    t0 = max(t0, 0.0);
    if (hitDrop) t1 = min(t1, d0);                 // the opaque droplet hides what is behind it
    const int MAX_STEPS = 48;
    float dt = (t1 - t0) / u_steps;
    float jitter = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    float t = t0 + dt * jitter;                    // dithering hides banding
    for (int i = 0; i < MAX_STEPS; i++) {
      if (float(i) >= u_steps) break;
      vec3 p = ro + rd * t;
      vec2 fl = flame(p);
      if (fl.x > 0.003) {
        float base = (1.0 - smoothstep(-0.35, 0.05, p.y)) * k;              // blue zone at the base on Earth
        vec3 earth = mix(sootColor(fl.y), vec3(0.25, 0.55, 1.0), base * 0.75) * 1.25;
        vec3 emi = mix(chemiColor(fl.y + 0.15) * 0.8, earth, k);
        float a = fl.x * dt * mix(4.0, 6.0, k);
        col += trans * emi * a;
        trans *= exp(-a * mix(0.5, 1.6, k));       // soot absorbs more than a clean blue flame
        if (trans < 0.02) break;
      }
      t += dt;
    }
  }
  if (hitDrop) col += trans * vec3(0.03, 0.035, 0.05);

  col = 1.0 - exp(-col * 1.35);                    // filmic-ish tone mapping
  float alpha = clamp(max(col.r, max(col.g, col.b)) * 1.2, 0.0, 1.0);
  gl_FragColor = vec4(col, alpha);                 // premultiplied: the card background shows through
}
`;

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.warn("Flame shader compile error:", gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

/** Height/width of the emitting volume in this model (used by the telemetry panel). */
export const webglAspect = (g: number) => (1 + 2.2 * g + (1 - 0.25 * g)) / (2 * (1 - 0.22 * g));

/** Returns null when WebGL is unavailable or the shader fails, so the caller can fall back to 2D. */
export function createWebGLFlame(canvas: HTMLCanvasElement): FlameRenderer | null {
  const opts: WebGLContextAttributes = { premultipliedAlpha: true, alpha: true, antialias: false, powerPreference: "low-power" };
  const gl = canvas.getContext("webgl", opts);
  if (!gl) return null;
  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.warn("Flame shader link error:", gl.getProgramInfoLog(prog));
    return null;
  }
  gl.useProgram(prog);

  // one oversized triangle covering the viewport
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "a_pos");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const uRes = gl.getUniformLocation(prog, "u_resolution");
  const uTime = gl.getUniformLocation(prog, "u_time");
  const uGrav = gl.getUniformLocation(prog, "u_gravity");
  const uMouse = gl.getUniformLocation(prog, "u_mouse");
  const uSteps = gl.getUniformLocation(prog, "u_steps");
  let steps = 40;
  gl.clearColor(0, 0, 0, 0);

  let lost = false;
  const onLost = (e: Event) => { e.preventDefault(); lost = true; };
  canvas.addEventListener("webglcontextlost", onLost);

  return {
    kind: "webgl",
    resize(cssW, cssH, scale) {
      canvas.width = Math.max(1, Math.round(cssW * scale));
      canvas.height = Math.max(1, Math.round(cssH * scale));
      gl.viewport(0, 0, canvas.width, canvas.height);
    },
    render({ time, gravity, yaw, pitch }) {
      if (lost) return;
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, time);
      gl.uniform1f(uGrav, gravity);
      gl.uniform2f(uMouse, yaw, pitch);
      gl.uniform1f(uSteps, steps);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    setDetail(n) { steps = Math.max(16, Math.min(48, Math.round(n))); },
    getDetail() { return steps; },
    dispose() {
      canvas.removeEventListener("webglcontextlost", onLost);
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.getExtension("WEBGL_lose_context")?.loseContext();   // free GPU memory immediately
    },
  };
}
