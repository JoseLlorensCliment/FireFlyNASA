/**
 * 2D Canvas fallback for browsers without WebGL (or if the flame shader fails to compile).
 * Same qualitative model as the WebGL renderer: spherical shell with diffusion arrows at 0 g,
 * teardrop with soot glow, blue base and buoyant draft at 1 g.
 */
import type { FlameRenderer } from "./types";

export const STRETCH = 2.2;   // vertical elongation of the upper half at 1 g (shared with the WebGL model)
const STANDOFF = 1.0;         // flame radius in units of R (droplet radius is 0.16 R)

type RGB = [number, number, number];
const mix = (a: RGB, b: RGB, t: number): RGB => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t)) as RGB;
const rgba = (c: RGB, a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a.toFixed(3)})`;
const smooth = (e0: number, e1: number, x: number) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

const BLUE_CORE: RGB = [190, 225, 255];
const BLUE: RGB = [76, 201, 240];
const DEEP_BLUE: RGB = [40, 90, 210];
const SOOT_CORE: RGB = [255, 246, 210];
const SOOT: RGB = [255, 176, 64];
const SOOT_EDGE: RGB = [255, 96, 40];

interface Particle { x: number; y: number; vx: number; vy: number; life: number; kind: "air" | "o2" | "fuel" }

export function createCanvas2DFlame(canvas: HTMLCanvasElement, reduceMotion: boolean): FlameRenderer | null {
  const context = canvas.getContext("2d");
  if (!context) return null;
  const ctx: CanvasRenderingContext2D = context;
  let w = 0, h = 0, t = 0;
  const particles: Particle[] = [];

  const shape = (cx: number, cy: number, R: number, gg: number, flick: number) => {
    const stretch = 1 + STRETCH * gg;
    ctx.beginPath();
    for (let i = 0; i <= 120; i++) {
      const th = (i / 120) * Math.PI * 2;
      let x = R * Math.sin(th);
      let y = -R * Math.cos(th);
      if (y < 0) {
        const u = -y / R;
        y *= stretch * (1 + flick * u);
        x *= 1 - 0.62 * gg * u * u;
        x += reduceMotion ? 0 : gg * 2.5 * Math.sin(t * 9 + u * 4) * u * u;
      } else {
        y *= 1 - 0.25 * gg;
      }
      if (i === 0) ctx.moveTo(cx + x, cy + y); else ctx.lineTo(cx + x, cy + y);
    }
    ctx.closePath();
  };

  const arrow = (x: number, y: number, ang: number, len: number, color: string) => {
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1.2;
    const ex = x + Math.cos(ang) * len, ey = y + Math.sin(ang) * len;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - Math.cos(ang - 0.5) * 4, ey - Math.sin(ang - 0.5) * 4);
    ctx.lineTo(ex - Math.cos(ang + 0.5) * 4, ey - Math.sin(ang + 0.5) * 4);
    ctx.closePath(); ctx.fill();
  };

  return {
    kind: "2d",
    resize(cssW, cssH, scale) {
      w = cssW; h = cssH;
      canvas.width = Math.max(1, Math.round(w * scale));
      canvas.height = Math.max(1, Math.round(h * scale));
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
    },
    render({ dt, gravity: gg }) {
      t += dt;
      const sootiness = smooth(0.05, 0.9, gg);
      const diff = 1 - smooth(0.0, 0.35, gg);
      ctx.clearRect(0, 0, w, h);
      const R = Math.min(w, h) * 0.15;
      const cx = w / 2, cy = h * (0.5 + 0.16 * gg);
      const flick = reduceMotion ? 0 : 0.05 * gg * Math.sin(t * 11) + 0.03 * gg * Math.sin(t * 23);

      if (!reduceMotion && dt > 0) {
        if (particles.length < 110 && Math.random() < dt * 36) {
          const roll = Math.random();
          if (roll < gg) {
            particles.push({ x: cx + (Math.random() - 0.5) * R * 3.2, y: cy + R * 1.6, vx: 0, vy: -(30 + 130 * gg), life: 1, kind: "air" });
          } else if (roll < gg + (1 - gg) * 0.55) {
            const a = Math.random() * Math.PI * 2, d = R * (1.9 + Math.random() * 0.5);
            particles.push({ x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d, vx: -Math.cos(a) * R * 0.55, vy: -Math.sin(a) * R * 0.55, life: 1, kind: "o2" });
          } else {
            const a = Math.random() * Math.PI * 2, d = R * 0.2;
            particles.push({ x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d, vx: Math.cos(a) * R * 0.45, vy: Math.sin(a) * R * 0.45, life: 1, kind: "fuel" });
          }
        }
        for (let i = particles.length - 1; i >= 0; i--) {
          const p = particles[i];
          if (p.kind === "air") p.vx = (cx - p.x) * 0.9;
          p.x += p.vx * dt; p.y += p.vy * dt;
          const dist = Math.hypot(p.x - cx, p.y - cy);
          p.life -= dt * (p.kind === "air" ? 0.45 : 0.4);
          if ((p.kind === "o2" && dist < R * STANDOFF * 1.05) || (p.kind === "fuel" && dist > R * STANDOFF * 0.92)) p.life = 0;
          if (p.life <= 0) particles.splice(i, 1);
        }
      }
      for (const p of particles) {
        if (p.kind === "air") {
          ctx.fillStyle = `rgba(255,200,140,${(0.35 * p.life * gg).toFixed(3)})`;
          ctx.fillRect(p.x, p.y, 1.5, 6);
        } else {
          const col = p.kind === "o2" ? `rgba(76,201,240,${(0.6 * p.life * diff).toFixed(3)})` : `rgba(255,170,90,${(0.55 * p.life * diff).toFixed(3)})`;
          arrow(p.x, p.y, Math.atan2(p.vy, p.vx), 7, col);
        }
      }

      const glowC = mix(BLUE, SOOT, sootiness);
      const gy = cy - R * gg * 1.1;
      const glow = ctx.createRadialGradient(cx, gy, R * 0.2, cx, gy, R * (2.4 + 1.2 * gg));
      glow.addColorStop(0, rgba(glowC, 0.12 + 0.12 * sootiness));
      glow.addColorStop(1, rgba(glowC, 0));
      ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h);

      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      if (diff > 0.01) {
        const shellR = R * STANDOFF;
        const shell = ctx.createRadialGradient(cx, cy, shellR * 0.55, cx, cy, shellR * 1.35);
        shell.addColorStop(0, rgba(DEEP_BLUE, 0));
        shell.addColorStop(0.62, rgba(BLUE, 0.55 * diff));
        shell.addColorStop(0.74, rgba(BLUE_CORE, 0.75 * diff));
        shell.addColorStop(0.86, rgba(BLUE, 0.35 * diff));
        shell.addColorStop(1, rgba(DEEP_BLUE, 0));
        shape(cx, cy, shellR * 1.35, gg, flick);
        ctx.fillStyle = shell; ctx.fill();
      }
      if (gg > 0.01) {
        const k = smooth(0.0, 0.35, gg);
        const body = (scale: number, alpha: number) => {
          shape(cx, cy, R * scale, gg, flick);
          const grad = ctx.createLinearGradient(cx, cy + R * scale, cx, cy - R * scale * (1 + STRETCH * gg));
          grad.addColorStop(0, rgba(BLUE, alpha * 0.9));
          grad.addColorStop(0.18, rgba(mix(BLUE, SOOT_EDGE, sootiness), alpha * 0.6));
          grad.addColorStop(0.35, rgba(mix(BLUE_CORE, SOOT_CORE, sootiness), alpha));
          grad.addColorStop(0.75, rgba(mix(BLUE, SOOT, sootiness), alpha * 0.8));
          grad.addColorStop(1, rgba(SOOT_EDGE, 0));
          ctx.fillStyle = grad; ctx.fill();
        };
        body(1.12, 0.25 * k);
        body(0.95, 0.6 * k);
        body(0.62, 0.75 * k * sootiness);
        ctx.save();
        ctx.beginPath(); ctx.rect(0, cy - R * 0.1, w, h); ctx.clip();
        shape(cx, cy, R * 1.02, gg, flick);
        const cup = ctx.createRadialGradient(cx, cy - R * 0.25, R * 0.45, cx, cy - R * 0.25, R * 1.1);
        cup.addColorStop(0, rgba(BLUE, 0));
        cup.addColorStop(0.7, rgba(BLUE, 0.55 * k));
        cup.addColorStop(1, rgba(DEEP_BLUE, 0));
        ctx.fillStyle = cup; ctx.fill();
        ctx.restore();
      }
      ctx.restore();

      ctx.fillStyle = "#0b0f17";
      ctx.beginPath(); ctx.arc(cx, cy, R * 0.16, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(229,234,242,0.45)"; ctx.lineWidth = 1; ctx.stroke();

      if (diff > 0.6) {
        ctx.save();
        ctx.globalAlpha = ((diff - 0.6) / 0.4) * 0.8;
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = "rgba(229,234,242,0.5)";
        ctx.beginPath(); ctx.moveTo(cx + R * 0.18, cy + 1); ctx.lineTo(cx + R * STANDOFF * 0.98, cy + 1); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "rgba(229,234,242,0.75)";
        ctx.font = "10px JetBrains Mono, monospace";
        ctx.textAlign = "center";
        ctx.fillText("standoff", cx + R * 0.58, cy + 13);
        ctx.restore();
      }
    },
    dispose() { particles.length = 0; },
  };
}
