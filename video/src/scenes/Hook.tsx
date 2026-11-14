import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Flame } from "../Flame";
import { C, easeOut, mono } from "../theme";
import { Backdrop, Eyebrow, Headline, Rise } from "../ui";

/** 0:00 – 0:06 · Earth flame turns into the microgravity sphere, drawn by the app's own WebGL renderer. */
export const Hook = () => {
  const f = useCurrentFrame();
  const g = 1 - easeOut((f - 60) / 70); // hold Earth, then let gravity go
  const first = interpolate(f, [84, 98], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill>
      <Backdrop glow={g > 0.5 ? C.flame : C.plasma} x="68%" y="50%" />
      <AbsoluteFill style={{ left: 760, top: 40, opacity: easeOut(f / 24) }}>
        <Flame width={1100} height={1000} gravity={g} yaw={0.55 + f * 0.004} />
      </AbsoluteFill>
      <AbsoluteFill style={{ padding: "0 0 0 140px", justifyContent: "center" }}>
        <div style={{ position: "relative", height: 300, width: 820 }}>
          <div style={{ position: "absolute", inset: 0, opacity: first }}>
            <Rise at={8}><Eyebrow color={C.muted}>On Earth</Eyebrow></Rise>
            <Rise at={14}><Headline size={104} style={{ marginTop: 24 }}>Fire rises.</Headline></Rise>
          </div>
          <div style={{ position: "absolute", inset: 0 }}>
            <Rise at={100}><Eyebrow color={C.plasma}>In microgravity</Eyebrow></Rise>
            <Rise at={106}><Headline size={104} style={{ marginTop: 24 }}>It becomes<br />a sphere.</Headline></Rise>
          </div>
        </div>
      </AbsoluteFill>
      <div style={{ position: "absolute", left: 140, bottom: 96, fontFamily: mono, fontSize: 26, color: C.fg2, opacity: easeOut((f - 20) / 20) }}>
        gravity <span style={{ color: C.fg }}>{g.toFixed(2)} g</span>
      </div>
      <div style={{ position: "absolute", right: 96, bottom: 72, fontFamily: mono, fontSize: 18, color: C.muted }}>
        Qualitative illustration · not a simulation
      </div>
    </AbsoluteFill>
  );
};
