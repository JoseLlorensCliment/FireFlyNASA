import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import stats from "../../public/data/stats.json";
import { C, easeOut, mono, sans } from "../theme";
import { Backdrop, Eyebrow, Headline, Rise } from "../ui";

const Screen = ({ src, at, x, y, w, rot }: { src: string; at: number; x: number; y: number; w: number; rot: number }) => {
  const f = useCurrentFrame();
  const p = easeOut((f - at) / 26);
  const drift = (f - at) * 0.08;
  return (
    <div style={{
      position: "absolute", left: x, top: y + (1 - p) * 60 - drift, width: w, opacity: p,
      transform: `perspective(2400px) rotateY(${rot}deg) rotateX(4deg)`,
      borderRadius: 18, overflow: "hidden", border: `1px solid ${C.lineStrong}`,
      boxShadow: "0 40px 120px rgb(0 0 0 / 0.6), 0 0 0 1px rgb(255 255 255 / 0.03) inset",
    }}>
      <Img src={staticFile(src)} style={{ width: "100%", display: "block" }} />
    </div>
  );
};

const Stat = ({ value, label, at }: { value: number; label: string; at: number }) => {
  const f = useCurrentFrame();
  const n = Math.round(value * easeOut((f - at) / 36));
  return (
    <Rise at={at}>
      <div style={{ fontFamily: sans, fontSize: 64, fontWeight: 600, letterSpacing: "-0.03em", color: C.fg }}>{n.toLocaleString("en-US")}</div>
      <div style={{ fontFamily: sans, fontSize: 24, color: C.fg2, marginTop: 4 }}>{label}</div>
    </Rise>
  );
};

/** 0:13 – 0:21 · The real product: screenshots of the running app plus its live counts. */
export const Product = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill>
      <Backdrop glow={C.plasma} x="70%" y="40%" />
      <Screen src="screens/safety.png" at={34} x={1010} y={300} w={860} rot={-14} />
      <Screen src="screens/compare.png" at={18} x={860} y={190} w={880} rot={-12} />
      <Screen src="screens/dashboard.png" at={4} x={700} y={90} w={900} rot={-10} />
      <AbsoluteFill style={{ background: `linear-gradient(90deg, ${C.bg} 30%, transparent 62%)` }} />
      <AbsoluteFill style={{ padding: "150px 0 0 140px" }}>
        <Rise at={0}><Eyebrow color={C.plasma}>Introducing</Eyebrow></Rise>
        <Rise at={6}><Headline size={112} style={{ marginTop: 22 }}>Flame<br />Intelligence</Headline></Rise>
        <Rise at={14}><div style={{ fontFamily: sans, fontSize: 34, lineHeight: 1.35, color: C.fg2, marginTop: 30, width: 600 }}>
          Over two decades of NASA microgravity combustion research, in one place you can search, compare and question.
        </div></Rise>
      </AbsoluteFill>
      <div style={{ position: "absolute", left: 140, bottom: 110, display: "flex", gap: 72, opacity: interpolate(f, [230, 255], [1, 1]) }}>
        <Stat value={stats.n_investigations} label="investigations" at={60} />
        <Stat value={stats.n_test_rows} label="test rows" at={72} />
        <Stat value={4392} label="indexed passages" at={84} />
      </div>
      <div style={{ position: "absolute", left: 140, bottom: 56, fontFamily: mono, fontSize: 18, color: C.muted }}>
        From 113 NASA documents · PSI records 1999–2025
      </div>
    </AbsoluteFill>
  );
};
