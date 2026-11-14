import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Flame } from "../Flame";
import { C, easeOut, mono, sans } from "../theme";
import { Backdrop, Rise } from "../ui";

/** 0:26 – 0:30 · Brand close. */
export const Close = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill>
      <Backdrop glow={C.plasma} x="50%" y="42%" />
      <AbsoluteFill style={{ alignItems: "center", top: 70, opacity: easeOut(f / 20) }}>
        <Flame width={520} height={460} gravity={0} yaw={0.55 + f * 0.01} scale={0.7} />
      </AbsoluteFill>
      <AbsoluteFill style={{ alignItems: "center", top: 560, textAlign: "center" }}>
        <Rise at={8}><div style={{ fontFamily: sans, fontSize: 120, fontWeight: 600, letterSpacing: "-0.035em", color: C.fg }}>Flame Intelligence</div></Rise>
        <Rise at={16}><div style={{ fontFamily: sans, fontSize: 40, color: C.fg2, marginTop: 14 }}>Fire-safety evidence for the Artemis generation.</div></Rise>
      </AbsoluteFill>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 64, textAlign: "center", fontFamily: mono, fontSize: 20, color: C.muted, opacity: easeOut((f - 24) / 16) }}>
        NASA Space Apps Challenge 2026 · Data: NASA PSI (CC0) · Independent project, not endorsed by NASA
      </div>
    </AbsoluteFill>
  );
};
