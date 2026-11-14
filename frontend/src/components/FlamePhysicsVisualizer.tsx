import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, Info, Move3d, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { createWebGLFlame, webglAspect } from "@/components/flame/webglFlame";
import { createCanvas2DFlame, STRETCH } from "@/components/flame/canvas2dFlame";
import type { FlameRenderer } from "@/components/flame/types";

/**
 * Interactive illustration of how gravity (buoyancy) shapes a small diffusion flame around a fuel droplet/wick.
 * Rendered as a 3D volumetric raymarched flame with WebGL, falling back to a 2D canvas drawing.
 *
 * Physics shown (textbook, consistent with the NASA FLEX fact sheet and PSI records):
 *  - Buoyant driving force ∝ g (Grashof Gr = g·β·ΔT·L³/ν²). For the same size and imposed flow, the Richardson
 *    number Ri = Gr/Re² (buoyancy vs forced flow) is also ∝ g, so it is reported relative to Earth.
 *  - 1 g: buoyancy draws air into the base and stretches a sooty, yellow, teardrop flame with a blue base.
 *  - 0 g: fuel vapour diffuses outward and oxygen inward; the flame is a spherical shell at a standoff distance
 *    (FLEX fact sheet: microgravity gives spherical symmetry; methanol burns with a very dim blue flame).
 * Not a simulation of PSI data: NASA PSI has no partial-gravity combustion data.
 */

const PRESETS = [
  { g: 0, label: "0 g", sub: "ISS" },
  { g: 0.16, label: "0.16 g", sub: "Moon" },
  { g: 0.38, label: "0.38 g", sub: "Mars" },
  { g: 1, label: "1 g", sub: "Earth" },
] as const;

const FLEX_SHEET = "https://www.nasa.gov/wp-content/uploads/2025/07/flame-extinguishment-experiment-flex.pdf";
const DEFAULT_VIEW = { yaw: 0.55, pitch: 0.22 };
const PITCH_MIN = -0.45, PITCH_MAX = 1.15;
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

function regime(g: number) {
  if (g < 0.02) return {
    name: "Diffusion-controlled — no buoyant flow", tone: "text-plasma",
    o2: "Oxygen diffuses inward from the surroundings while fuel vapour diffuses outward; the flame sits where they meet",
    color: "Dim blue for clean-burning fuels (e.g. methanol in FLEX); sooty fuels can still glow, but no buoyant plume carries soot upward",
    shape: "Spherical shell around the fuel, at a standoff distance",
  };
  if (g < 0.5) return {
    name: "Transitional — weak buoyancy", tone: "text-warn",
    o2: "Diffusion plus a weak buoyant draft into the base",
    color: "Blue base with a growing yellow (soot) region",
    shape: "Elongating; a buoyant plume starts to form",
  };
  return {
    name: "Buoyancy-dominated — natural convection", tone: "text-flame",
    o2: "Rising hot gas draws fresh air into the base of the flame",
    color: "Yellow/orange: soot particles heated to incandescence; blue reaction zone at the base",
    shape: "Teardrop, stretched upward by the buoyant plume",
  };
}

export function FlamePhysicsVisualizer() {
  const [g, setG] = useState(0);
  const [kind, setKind] = useState<FlameRenderer["kind"] | null>(null);
  const [quality, setQuality] = useState<number | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const gRef = useRef(g);
  const view = useRef({ ...DEFAULT_VIEW, dragging: false, lastX: 0, lastY: 0, lastInteraction: 0 });
  gRef.current = g;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const dpr = window.devicePixelRatio || 1;

    const makeCanvas = () => {
      const c = document.createElement("canvas");
      c.className = "block h-full w-full";
      c.setAttribute("aria-hidden", "true");
      host.appendChild(c);
      return c;
    };
    // Prefer the WebGL volumetric renderer; fall back to 2D if WebGL is unavailable or the shader fails.
    // A canvas that already handed out a WebGL context cannot give a 2D one, so the fallback gets a fresh canvas.
    let canvas = makeCanvas();
    let renderer: FlameRenderer | null = createWebGLFlame(canvas);
    let scale = 0.6;                                   // WebGL backing-store pixels per CSS pixel (adaptive)
    const maxScale = Math.min(1, dpr), minScale = 0.3;
    if (!renderer) {
      canvas.remove();
      canvas = makeCanvas();
      renderer = createCanvas2DFlame(canvas, reduce);
      scale = Math.min(2, dpr);
    }
    if (!renderer) { canvas.remove(); return; }
    const r: FlameRenderer = renderer;
    setKind(r.kind);
    setQuality(r.kind === "webgl" ? scale : null);

    let cssW = 0, cssH = 0, raf = 0, last = 0, time = 0, visible = true;
    let shown = gRef.current;
    let frames = 0, acc = 0, cooldown = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      cssW = rect.width; cssH = rect.height;
      r.resize(cssW, cssH, scale);
      if (!raf) draw(0);                               // keep a correct still frame while paused
    };

    function draw(dt: number) {
      const v = view.current;
      if (!reduce && !v.dragging && performance.now() - v.lastInteraction > 4000) v.yaw += dt * 0.22; // gentle auto-orbit
      r.render({ time, dt, gravity: shown, yaw: v.yaw, pitch: v.pitch });
    }

    // Adaptive quality: keep ~40-60 fps on low-end GPUs (e.g. integrated graphics).
    // Slow → first lower the resolution, then the raymarch steps. Fast → restore steps first, then resolution.
    const adapt = (frameMs: number) => {
      if (r.kind !== "webgl") return;
      frames++; acc += frameMs;
      if (cooldown > 0) { cooldown--; frames = 0; acc = 0; return; }
      if (frames < 30) return;
      const avg = acc / frames;
      frames = 0; acc = 0;
      const steps = r.getDetail?.() ?? 40;
      let next = scale, nextSteps = steps;
      if (avg > 1000 / 40) {
        if (scale > 0.45) next = Math.max(minScale, scale * 0.8);
        else if (steps > 20) nextSteps = steps - 8;
        else if (scale > minScale) next = Math.max(minScale, scale * 0.85);
      } else if (avg < 1000 / 57) {
        if (steps < 40) nextSteps = steps + 4;
        else if (scale < maxScale) next = Math.min(maxScale, scale * 1.1);
      }
      if (nextSteps !== steps) { r.setDetail?.(nextSteps); cooldown = 20; }
      if (Math.abs(next - scale) > 0.01) {
        scale = next; cooldown = 20;
        r.resize(cssW, cssH, scale);
        setQuality(scale);
      }
    };

    const frame = (now: number) => {
      const frameMs = last ? now - last : 16.7;
      const dt = Math.min(0.05, frameMs / 1000);
      last = now;
      if (!reduce) time += dt;
      shown += (gRef.current - shown) * Math.min(1, dt * 4);
      draw(dt);
      adapt(frameMs);
      raf = requestAnimationFrame(frame);
    };
    const start = () => { if (!raf && visible && !document.hidden) { last = 0; raf = requestAnimationFrame(frame); } };
    const stop = () => { if (raf) { cancelAnimationFrame(raf); raf = 0; } };

    // Pause when off-screen or in a background tab (keeps low-end laptops cool).
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) start(); else stop(); }, { threshold: 0.05 });
    const onVis = () => (document.hidden ? stop() : start());
    const ro = new ResizeObserver(resize);
    ro.observe(canvas); io.observe(canvas);
    document.addEventListener("visibilitychange", onVis);
    resize();
    start();
    return () => {
      stop();
      ro.disconnect(); io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      r.dispose();
      canvas.remove();
    };
  }, []);

  // ---- 3D orbit controls (mouse, touch, pen, keyboard) ------------------------------------------
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const v = view.current;
    v.dragging = true; v.lastX = e.clientX; v.lastY = e.clientY; v.lastInteraction = performance.now();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* capture unsupported: dragging still works while inside */ }
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const v = view.current;
    if (!v.dragging) return;
    v.yaw -= (e.clientX - v.lastX) * 0.008;
    v.pitch = clamp(v.pitch + (e.clientY - v.lastY) * 0.006, PITCH_MIN, PITCH_MAX);
    v.lastX = e.clientX; v.lastY = e.clientY; v.lastInteraction = performance.now();
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    view.current.dragging = false;
    view.current.lastInteraction = performance.now();
    try { if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const v = view.current;
    const step = 0.12;
    if (e.key === "ArrowLeft") v.yaw += step;
    else if (e.key === "ArrowRight") v.yaw -= step;
    else if (e.key === "ArrowUp") v.pitch = clamp(v.pitch + step, PITCH_MIN, PITCH_MAX);
    else if (e.key === "ArrowDown") v.pitch = clamp(v.pitch - step, PITCH_MIN, PITCH_MAX);
    else return;
    e.preventDefault();
    v.lastInteraction = performance.now();
  };
  const resetView = () => { Object.assign(view.current, DEFAULT_VIEW, { lastInteraction: 0 }); };

  const rg = regime(g);
  const aspect = kind === "webgl" ? webglAspect(g) : (1 + STRETCH * g + (1 - 0.25 * g)) / 2;
  const valueText = `${g.toFixed(2)} g — ${rg.name}`;
  const is3d = kind === "webgl";

  return (
    <section className="card overflow-hidden" aria-labelledby="flame-viz-title">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line/70 px-5 py-4">
        <div>
          <div className="label text-plasma">Interactive · flame physics{is3d ? " · 3D" : ""}</div>
          <h3 id="flame-viz-title" className="mt-1 text-sm font-semibold">Why flames behave differently in space</h3>
          <p className="mt-0.5 text-xs text-muted">
            Move the gravity slider: buoyancy shapes a flame on Earth; without it, diffusion does.{is3d && " Drag the flame to orbit around it."}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Gravity presets">
          {PRESETS.map((p) => {
            const active = Math.abs(g - p.g) < 0.005;
            return (
              <button key={p.label} onClick={() => setG(p.g)} aria-pressed={active}
                className={cn("rounded-md border px-2.5 py-1 text-xs transition-colors",
                  active ? "border-flame/60 bg-flame/10 text-flame" : "border-line text-muted hover:border-plasma/40 hover:text-fg")}>
                <span className="num font-semibold">{p.label}</span> <span>{p.sub}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="relative bg-[radial-gradient(ellipse_at_center,rgba(20,26,37,0.75),rgba(8,11,17,0.9)_75%)]">
          <div ref={hostRef}
            className={cn("h-[320px] w-full outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-plasma/50 md:h-[380px]",
              is3d && "cursor-grab touch-none active:cursor-grabbing")}
            role="img" tabIndex={is3d ? 0 : -1}
            aria-label={`${is3d ? "3D volumetric" : "Illustrative"} flame at ${valueText}${is3d ? ". Use the arrow keys to rotate the view." : ""}`}
            onPointerDown={is3d ? onPointerDown : undefined} onPointerMove={is3d ? onPointerMove : undefined}
            onPointerUp={is3d ? onPointerUp : undefined} onPointerCancel={is3d ? onPointerUp : undefined}
            onKeyDown={is3d ? onKeyDown : undefined} onDoubleClick={is3d ? resetView : undefined} />

          <div className="pointer-events-none absolute left-4 top-3 flex items-center gap-2">
            <span className="num rounded-md border border-line bg-bg/70 px-2 py-1 text-xs">g = <span className={rg.tone}>{g.toFixed(2)}</span></span>
            {is3d && <span className="hidden items-center gap-1 rounded-md border border-line bg-bg/70 px-2 py-1 text-[10px] text-muted sm:inline-flex">
              <Move3d className="h-3 w-3" /> drag to orbit</span>}
          </div>
          {is3d && (
            <button onClick={resetView} className="absolute right-4 top-3 inline-flex items-center gap-1 rounded-md border border-line bg-bg/70 px-2 py-1 text-[10px] text-muted hover:text-fg">
              <RotateCcw className="h-3 w-3" /> reset view
            </button>
          )}

          <div className="absolute inset-x-5 bottom-3">
            <input type="range" min={0} max={1} step={0.01} value={g} onChange={(e) => setG(Number(e.target.value))}
              className="w-full accent-[#ff7a1a]" aria-label="Gravity level in g" aria-valuetext={valueText} />
            <div className="num relative h-3 text-[10px] text-muted">
              {PRESETS.map((p) => (
                <span key={p.label} className="absolute -translate-x-1/2" style={{ left: `${p.g * 100}%` }}>{p.label}</span>
              ))}
            </div>
          </div>
        </div>

        <dl className="space-y-3 border-t border-line/70 p-5 text-sm lg:border-l lg:border-t-0">
          <div>
            <dt className="label">Buoyancy vs diffusion</dt>
            <dd className="mt-1 flex items-center gap-2">
              <div className="flex h-2 flex-1 overflow-hidden rounded-full bg-line" aria-hidden>
                <div className="h-2 bg-flame transition-[width] duration-300" style={{ width: `${g * 100}%` }} />
                <div className="h-2 flex-1 bg-plasma/70" />
              </div>
            </dd>
            <dd className="mt-1 flex justify-between text-[10px] text-muted"><span className="text-flame">buoyant convection</span><span className="text-plasma">molecular diffusion</span></dd>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <dt className="label">Gr relative to Earth</dt>
              <dd className="num mt-0.5 text-lg text-fg">{g === 0 ? "0" : `${g.toFixed(2)}×`}</dd>
              <dd className="text-[10px] leading-snug text-muted">Gr = g·β·ΔT·L³/ν² ∝ g</dd>
            </div>
            <div>
              <dt className="label">Ri = Gr/Re²</dt>
              <dd className="num mt-0.5 text-lg text-fg">{g === 0 ? "0" : `${g.toFixed(2)}×`}</dd>
              <dd className="text-[10px] leading-snug text-muted">vs Earth, same size and flow speed</dd>
            </div>
          </div>
          <div><dt className="label">Regime</dt><dd className={cn("mt-0.5 font-medium", rg.tone)}>{rg.name}</dd></div>
          <div><dt className="label">Oxygen supply</dt><dd className="mt-0.5 text-fg/90">{rg.o2}</dd></div>
          <div><dt className="label">Colour / mechanism</dt><dd className="mt-0.5 text-fg/90">{rg.color}</dd></div>
          <div><dt className="label">Geometry</dt><dd className="mt-0.5 text-fg/90">{rg.shape} <span className="num text-xs text-muted">(drawn H/W ≈ {aspect.toFixed(1)})</span></dd></div>
          <div className="rounded-lg border border-plasma/30 bg-plasma/5 p-3 text-[13px] leading-relaxed text-fg/90">
            <b className="text-plasma">Why it matters for spacecraft:</b> without buoyancy, hot gas and smoke are not carried
            upward — they move only with the cabin ventilation flow. NASA's{" "}
            <Link to="/experiments/PSI-26" className="text-plasma hover:underline">BASS</Link> tested the hypothesis that, with
            adequate ventilation, materials burn in microgravity as well as or better than on Earth, and{" "}
            <Link to="/experiments/PSI-69" className="text-plasma hover:underline">FLEX</Link> /{" "}
            <Link to="/experiments/PSI-39" className="text-plasma hover:underline">CFI</Link> study droplets that keep burning as
            dim, low-temperature “cool flames”.
          </div>
          <p className="flex gap-1.5 text-[11px] leading-snug text-muted">
            <Info className="mt-0.5 h-3 w-3 shrink-0" />
            <span>
              Qualitative illustration, not a simulation: shapes and colours are artistic. NASA PSI has no partial-gravity
              combustion data; Moon and Mars only interpolate between 1 g and microgravity. Source for the 0 g picture:{" "}
              <a href={FLEX_SHEET} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-plasma hover:underline">
                NASA FLEX fact sheet <ExternalLink className="h-2.5 w-2.5" /></a>.
              {is3d && quality !== null && <> Rendering: WebGL raymarching at <span className="num">{Math.round(quality * 100)}%</span> resolution (adaptive).</>}
              {kind === "2d" && <> Rendering: 2D fallback (WebGL unavailable).</>}
            </span>
          </p>
        </dl>
      </div>
    </section>
  );
}
