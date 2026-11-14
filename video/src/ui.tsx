import { interpolate, useCurrentFrame } from "remotion";
import { C, easeOut, mono, sans } from "./theme";

/** Text that rises 24px and fades in once, starting at `at` frames into the scene. */
export const Rise = ({ at = 0, dur = 18, children, style }: { at?: number; dur?: number; children: React.ReactNode; style?: React.CSSProperties }) => {
  const f = useCurrentFrame();
  const p = easeOut((f - at) / dur);
  return <div style={{ opacity: p, transform: `translateY(${(1 - p) * 24}px)`, ...style }}>{children}</div>;
};

export const Eyebrow = ({ children, color = C.flame }: { children: React.ReactNode; color?: string }) => (
  <div style={{ fontFamily: sans, fontSize: 22, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase", color }}>{children}</div>
);

export const Headline = ({ children, size = 96, style }: { children: React.ReactNode; size?: number; style?: React.CSSProperties }) => (
  <div style={{ fontFamily: sans, fontSize: size, fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1.04, color: C.fg, ...style }}>{children}</div>
);

export const Mono = ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) => (
  <span style={{ fontFamily: mono, letterSpacing: "0.02em", ...style }}>{children}</span>
);

/** Fades the whole scene out over its last `out` frames. */
export const useSceneOut = (duration: number, out = 12) => {
  const f = useCurrentFrame();
  return interpolate(f, [duration - out, duration], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
};

export const Backdrop = ({ glow = C.plasma, x = "50%", y = "50%" }: { glow?: string; x?: string; y?: string }) => (
  <div style={{ position: "absolute", inset: 0, background: `radial-gradient(1100px 700px at ${x} ${y}, ${glow}14, transparent 70%), ${C.bg}` }} />
);
