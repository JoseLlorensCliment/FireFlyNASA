import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import data from "../../public/data/atmospheres.json";
import { C, easeOut, mono, sans } from "../theme";
import { Backdrop, Eyebrow, Headline, Rise } from "../ui";

type P = { o2: number; pressure: number; inverse?: boolean };
// Ambient-atmosphere rows only (inverse flames feed O₂ through the burner, not the cabin) — same rule as the app.
const pts = (data.points as P[]).filter((p) => !p.inverse);
const inMoon = (p: P) => p.o2 >= 30 && p.pressure <= 70.3;

const W = 980, H = 620, X0 = 70, Y1 = 560, YMAX = 520;
const x = (o2: number) => X0 + (o2 / 100) * (W - X0 - 20);
const y = (kpa: number) => Y1 - (Math.min(kpa, YMAX) / YMAX) * (Y1 - 20);

/** 0:06 – 0:13 · Where the evidence is vs where the Moon Base will be. Real PSI rows from the app's API. */
export const Gap = () => {
  const f = useCurrentFrame();
  const region = easeOut((f - 70) / 24);
  const zoom = 1 + 0.9 * easeOut((f - 120) / 50);
  const count = Math.round(20 * easeOut((f - 96) / 40));
  return (
    <AbsoluteFill>
      <Backdrop glow={C.flame} x="30%" y="60%" />
      <AbsoluteFill style={{ padding: "110px 0 0 140px" }}>
        <Rise at={4}><Eyebrow>The Moon Base gap</Eyebrow></Rise>
        <Rise at={10}><Headline size={84} style={{ marginTop: 22 }}>≥30% O₂ at ≤10.2 psi</Headline></Rise>
        <Rise at={16}><div style={{ fontFamily: sans, fontSize: 32, color: C.fg2, marginTop: 18 }}>Expected Moon Base &amp; rover atmosphere, per the challenge brief.</div></Rise>
      </AbsoluteFill>

      <div style={{ position: "absolute", left: 120, top: 400, width: W, height: H, overflow: "hidden", borderRadius: 20, border: `1px solid ${C.line}`, background: C.surface }}>
        <svg width={W} height={H} style={{ transform: `scale(${zoom})`, transformOrigin: `${x(62)}px ${y(30)}px` }}>
          {[0, 20, 40, 60, 80, 100].map((v) => <line key={v} x1={x(v)} x2={x(v)} y1={20} y2={Y1} stroke={C.line} strokeWidth={1} />)}
          {[0, 100, 200, 300, 400, 500].map((v) => <line key={v} x1={X0} x2={W - 20} y1={y(v)} y2={y(v)} stroke={C.line} strokeWidth={1} />)}
          <rect x={x(30)} y={y(70.3)} width={x(100) - x(30)} height={Y1 - y(70.3)} fill={C.flame} fillOpacity={0.12 * region} stroke={C.flame} strokeOpacity={0.7 * region} strokeWidth={1.5} />
          {pts.map((p, i) => {
            const appear = easeOut((f - 20 - (i % 60) * 0.6) / 14);
            const hit = inMoon(p);
            const dim = hit ? 1 : 1 - 0.65 * region;
            return <circle key={i} cx={x(p.o2)} cy={y(p.pressure)} r={hit ? 6 : 4.5} fill={hit ? C.flame : C.series[0]}
              opacity={appear * dim} stroke={C.surface} strokeWidth={1.5} />;
          })}
          {[0, 20, 40, 60, 80, 100].map((v) => <text key={v} x={x(v)} y={Y1 + 34} fill={C.muted} fontFamily={mono} fontSize={18} textAnchor="middle">{v}</text>)}
        </svg>
        <div style={{ position: "absolute", left: 24, top: 18, fontFamily: mono, fontSize: 18, color: C.muted }}>pressure (kPa) ↑ · O₂ (%) →</div>
      </div>

      <div style={{ position: "absolute", left: 1220, top: 470, width: 600 }}>
        <Rise at={92}>
          <div style={{ fontFamily: sans, fontWeight: 600, fontSize: 200, letterSpacing: "-0.04em", lineHeight: 0.9, color: C.fg }}>
            {count}<span style={{ fontSize: 64, color: C.muted, letterSpacing: "-0.02em" }}> / 734</span>
          </div>
        </Rise>
        <Rise at={104}><div style={{ fontFamily: sans, fontSize: 34, lineHeight: 1.35, color: C.fg2, marginTop: 28 }}>
          ambient test rows in NASA PSI fall inside that atmosphere.
        </div></Rise>
        <Rise at={140}><div style={{ fontFamily: sans, fontSize: 34, lineHeight: 1.35, color: C.fg, marginTop: 22, fontWeight: 600 }}>
          None with solid cabin materials.
        </div></Rise>
      </div>
      <div style={{ position: "absolute", left: 120, bottom: 40, fontFamily: mono, fontSize: 18, color: C.muted, opacity: interpolate(f, [30, 50], [0, 1], { extrapolateRight: "clamp" }) }}>
        Source: NASA Physical Sciences Informatics (PSI) experimental tables · rows reporting both O₂ and pressure
      </div>
    </AbsoluteFill>
  );
};
