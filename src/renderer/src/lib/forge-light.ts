/**
 * The light over a canvas being built. It falls from a slit at the top edge,
 * at the angle the light always has here, onto the middle of the tile. The
 * further the build, the wider the slit opens and the more of the middle
 * stands in the light. Every sign from omadia sends a pulse down the beam.
 * By night only the air inside the cone is to be seen (the fog); by day the
 * room dims away from the slit and the light lands as a patch, sharp at the
 * slit and soft at its end. Nothing glows by itself.
 */

/** In pane px. The cone's axis runs through `aim`; it opens with `open`. */
export interface Cone {
  aimX: number;
  aimY: number;
  /** horizontal shift of the axis per px upward: the light's fixed angle */
  slope: number;
  /** half width at the top edge, fully open */
  top: number;
  /** half width at the aim, fully open */
  full: number;
  /** 0..1, how far the slit is open */
  open: number;
}

const SLOPE = 0.45;
/** never quite shut: a closed slit would be no light at all */
const MIN_OPEN = 0.14;

export function coneFor(
  width: number,
  aim: { x: number; y: number },
  progress: number,
): Cone {
  return {
    aimX: aim.x,
    aimY: Math.max(1, aim.y),
    slope: SLOPE,
    // Proportions of the concept: a narrow slit, a third of the tile wide
    // where it lands.
    top: Math.max(28, width * 0.035),
    full: Math.max(280, width * 0.17),
    // Slow at first: the middle is fully in the light only near the end.
    open: MIN_OPEN + (1 - MIN_OPEN) * Math.min(1, Math.max(0, progress)) ** 1.6,
  };
}

export const axisAt = (c: Cone, y: number): number =>
  c.aimX + c.slope * (c.aimY - y);

export const halfWidthAt = (c: Cone, y: number): number =>
  c.open * (c.top + ((c.full - c.top) * Math.max(0, y)) / c.aimY);

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** How much light falls on a point of the pane, 0..1. */
export const litAt = (c: Cone, x: number, y: number): number =>
  1 - smooth(0.7, 1.05, Math.abs(x - axisAt(c, y)) / halfWidthAt(c, y));

/**
 * A CSS mask for a box (pane px) that lets through what stands in the cone:
 * the two edges of the cone as two half planes, intersected.
 */
export function coneMask(
  c: Cone,
  box: { left: number; top: number; width: number; height: number },
  feather = 18,
): string {
  const cx = box.left + box.width / 2;
  const cy = box.top + box.height / 2;
  // Each edge is x = x0 + m * y in pane px.
  const grow = (c.open * (c.full - c.top)) / c.aimY;
  const edges = [
    { side: -1, m: -c.slope - grow },
    { side: 1, m: -c.slope + grow },
  ];
  return edges
    .map(({ side, m }) => {
      const ex = axisAt(c, cy) + side * halfWidthAt(c, cy);
      // Normal into the lit side.
      const len = Math.hypot(1, m);
      const nx = -side / len;
      const ny = (side * m) / len;
      const deg = (Math.atan2(nx, -ny) * 180) / Math.PI;
      const rad = (deg * Math.PI) / 180;
      const span =
        Math.abs(box.width * Math.sin(rad)) +
        Math.abs(box.height * Math.cos(rad));
      const s = (ex - cx) * nx + span / 2;
      return `linear-gradient(${deg.toFixed(2)}deg, transparent ${(
        s - feather
      ).toFixed(1)}px, #000 ${(s + feather).toFixed(1)}px)`;
    })
    .join(", ");
}

/* ── the fog in the cone (WebGL) ── */

const VS = "attribute vec2 a; void main() { gl_Position = vec4(a, 0.0, 1.0); }";

const FS = `precision highp float;
uniform float u_time;
uniform vec2 u_res;
uniform float u_scale;
uniform vec4 u_cone;
uniform vec2 u_width;
uniform vec3 u_ground;
uniform vec3 u_light;
uniform vec3 u_ink;
uniform vec3 u_patch;
uniform float u_day;
uniform vec2 u_k;
uniform float u_pulse[4];
float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1.0, 0.0, 0.0)), f.x), mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
             mix(mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x), mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}
float fbm(vec3 p) { float a = 0.5; float s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise(p); p *= 2.02; a *= 0.5; } return s; }
void main() {
  vec2 p = vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y) * u_scale;
  float h = u_res.y * u_scale;
  float t = u_time;
  float aimX = u_cone.x; float aimY = u_cone.y; float slope = u_cone.z; float open = u_cone.w;
  float ax = aimX + slope * (aimY - p.y);
  float hw = open * (u_width.x + (u_width.y - u_width.x) * max(p.y, 0.0) / aimY);
  float across = (p.x - ax) / hw;
  float cone = 1.0 - smoothstep(0.55, 1.12, abs(across));
  float along = p.y / h;
  float fog = fbm(vec3(p.x * 0.0032 + t * 0.012, p.y * 0.0048 - t * 0.02, t * 0.035));
  float rays = fbm(vec3((p.x - ax) * 0.018, p.y * 0.0011 - t * 0.04, t * 0.015));
  float fall = mix(1.0, 0.25, clamp(along, 0.0, 1.0));
  float I = cone * fall * (0.3 + 0.7 * smoothstep(0.3, 0.8, fog)) * (0.65 + 0.7 * rays);
  float pulse = 0.0;
  for (int i = 0; i < 4; i++) {
    float age = t - u_pulse[i];
    if (age > 0.0 && age < 2.6) {
      float front = age / 1.7 * aimY * 1.25;
      float d = (p.y - front) / (60.0 + 80.0 * along);
      pulse += exp(-d * d) * (1.0 - age / 2.6);
    }
  }
  I += cone * fall * pulse * 0.55;
  float k = mix(u_k.x, u_k.y, clamp(along, 0.0, 1.0));
  vec3 night = mix(u_ground, u_light, clamp(I * k, 0.0, 1.0));

  // Day. The room dims radially from the slit, never inside the light.
  vec2 slit = vec2(aimX + slope * aimY, 0.0);
  float r = length(p - slit) / (0.88 * length(u_res * u_scale));
  float veil = r < 0.22 ? 0.032 * r / 0.22 : mix(0.032, 0.09, clamp((r - 0.22) / 0.78, 0.0, 1.0));
  veil *= smoothstep(0.6, 1.5, abs(across));
  // The patch: sharp at the slit, soft at its end, then it runs out.
  float len = min(h, aimY * 1.9);
  float f = p.y / len;
  float soft = mix(2.5, 30.0, clamp(f, 0.0, 1.0));
  float cover = 1.0 - smoothstep(-soft, soft, abs(p.x - ax) - hw);
  float fade = f < 0.7 ? mix(0.95, 0.7, f / 0.7) : mix(0.7, 0.0, clamp((f - 0.7) / 0.3, 0.0, 1.0));
  float air = 0.18 * clamp(1.0 - f / 0.86, 0.0, 1.0) * cone;
  vec3 day = mix(u_ground, u_ink, veil);
  day = mix(day, u_patch, cover * fade);
  day = mix(day, vec3(1.0), clamp(air + pulse * 0.12 * cover, 0.0, 1.0));

  vec3 col = mix(night, day, u_day);
  col += (hash(vec3(gl_FragCoord.xy, t)) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}`;

export interface ForgeLight {
  /** where the light falls, in pane px, and how far the build is */
  aim(target: { x: number; y: number }, progress: number): void;
  /** a sign from omadia: a pulse of light runs down the beam */
  pulse(): void;
  destroy(): void;
}

/** The cone as it stands this frame, for whatever it lights. */
export type OnCone = (cone: Cone, width: number, height: number) => void;

const PULSE_GAP_MS = 700;
/** the fog is soft: half the pane's px are plenty */
const RESOLUTION = 0.5;

function rgb(css: string, fallback: number[]): number[] {
  const v = css.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v)?.[1];
  if (hex) {
    const full =
      hex.length === 3 ? [...hex].map((ch) => ch + ch).join("") : hex;
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
  }
  const nums = /rgba?\(([^)]+)\)/.exec(v)?.[1]?.split(/[ ,/]+/);
  if (nums && nums.length >= 3) {
    return nums.slice(0, 3).map((n) => Number(n) / 255);
  }
  return fallback;
}

function program(gl: WebGLRenderingContext): WebGLProgram | null {
  const shader = (type: number, src: string): WebGLShader | null => {
    const s = gl.createShader(type);
    if (!s) return null;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
  };
  const vs = shader(gl.VERTEX_SHADER, VS);
  const fs = shader(gl.FRAGMENT_SHADER, FS);
  const prog = gl.createProgram();
  if (!vs || !fs || !prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  return gl.getProgramParameter(prog, gl.LINK_STATUS) ? prog : null;
}

/** Null when there is no WebGL: the caller keeps the still cone. */
export function startForgeLight(
  canvas: HTMLCanvasElement,
  opts: { reduced: boolean; onCone: OnCone },
): ForgeLight | null {
  const gl = canvas.getContext("webgl", { antialias: false, alpha: false });
  const prog = gl ? program(gl) : null;
  if (!gl || !prog) return null;
  gl.useProgram(prog);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  );
  const loc = gl.getAttribLocation(prog, "a");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const u = (name: string) => gl.getUniformLocation(prog, name);
  const uTime = u("u_time");
  const uRes = u("u_res");
  const uScale = u("u_scale");
  const uCone = u("u_cone");
  const uWidth = u("u_width");
  const uGround = u("u_ground");
  const uLight = u("u_light");
  const uInk = u("u_ink");
  const uPatch = u("u_patch");
  const uDay = u("u_day");
  const uK = u("u_k");
  const uPulse = u("u_pulse");

  const t0 = performance.now();
  let aim = { x: 0, y: 0 };
  let progress = 0;
  // The slit opens smoothly, whatever steps the progress takes.
  let shown = 0;
  const pulses = [-100, -100, -100, -100];
  let lastPulse = -Infinity;
  let ground = [0.04, 0.04, 0.043];
  let light = [0.95, 0.94, 0.9];
  let ink = [0.08, 0.08, 0.09];
  let patch = [1, 0.99, 0.96];
  let k = [0.16, 0.03];
  // Night 0, day 1; a theme switch blends the medium, the cone stays.
  let dayTarget = 0;
  let day = -1;
  let frame = 0;
  let last = t0;
  let raf = 0;

  function readColours(): void {
    const css = getComputedStyle(canvas);
    ground = rgb(css.getPropertyValue("--ground"), ground);
    light = rgb(css.getPropertyValue("--light"), light);
    ink = rgb(css.getPropertyValue("--ink"), ink);
    patch = rgb(css.getPropertyValue("--cone-patch"), patch);
    dayTarget = Number(css.getPropertyValue("--cone-day")) === 1 ? 1 : 0;
    const top = Number(css.getPropertyValue("--cone-top"));
    const bottom = Number(css.getPropertyValue("--cone-bottom"));
    if (top > 0) k = [top, bottom > 0 ? bottom : top / 5];
  }

  function step(now: number): void {
    raf = requestAnimationFrame(step);
    if (!gl) return;
    const dt = Math.min(64, now - last);
    last = now;
    if (frame++ % 10 === 0) readColours();
    day =
      day < 0 || opts.reduced
        ? dayTarget
        : day +
          Math.sign(dayTarget - day) *
            Math.min(Math.abs(dayTarget - day), dt / 400);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === 0 || h === 0) return;
    const cw = Math.round(w * RESOLUTION);
    const ch = Math.round(h * RESOLUTION);
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }
    shown = opts.reduced
      ? progress
      : shown + (progress - shown) * Math.min(1, dt / 900);
    const cone = coneFor(w, aim, shown);
    opts.onCone(cone, w, h);
    const time = opts.reduced ? 12 : (now - t0) / 1000 + 12;
    gl.viewport(0, 0, cw, ch);
    gl.uniform1f(uTime, time);
    gl.uniform2f(uRes, cw, ch);
    gl.uniform1f(uScale, 1 / RESOLUTION);
    gl.uniform4f(uCone, cone.aimX, cone.aimY, cone.slope, cone.open);
    gl.uniform2f(uWidth, cone.top, cone.full);
    gl.uniform3f(uGround, ground[0] ?? 0, ground[1] ?? 0, ground[2] ?? 0);
    gl.uniform3f(uLight, light[0] ?? 1, light[1] ?? 1, light[2] ?? 1);
    gl.uniform3f(uInk, ink[0] ?? 0, ink[1] ?? 0, ink[2] ?? 0);
    gl.uniform3f(uPatch, patch[0] ?? 1, patch[1] ?? 1, patch[2] ?? 1);
    gl.uniform1f(uDay, day);
    gl.uniform2f(uK, k[0] ?? 0.16, k[1] ?? 0.03);
    gl.uniform1fv(uPulse, pulses);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  raf = requestAnimationFrame(step);

  return {
    aim(target, p) {
      aim = target;
      progress = Math.max(progress, p);
    },
    pulse() {
      const now = performance.now();
      if (opts.reduced || now - lastPulse < PULSE_GAP_MS) return;
      lastPulse = now;
      pulses.shift();
      pulses.push((now - t0) / 1000 + 12);
    },
    destroy() {
      cancelAnimationFrame(raf);
      // The context stays with the canvas: a remount draws on it again.
      gl.deleteBuffer(buffer);
      gl.deleteProgram(prog);
    },
  };
}
