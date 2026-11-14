import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { AbsoluteFill } from "remotion";
import { Cite } from "./scenes/Cite";
import { Close } from "./scenes/Close";
import { Gap } from "./scenes/Gap";
import { Hook } from "./scenes/Hook";
import { Product } from "./scenes/Product";
import { C, mono } from "./theme";

// 195 + 225 + 255 + 180 + 105 = 960 frames, minus 4 fades of 15 = 900 frames = 30 s at 30 fps.
export const Promo = () => (
  <AbsoluteFill style={{ background: C.bg }}>
    <TransitionSeries>
      <TransitionSeries.Sequence name="Hook · fire becomes a sphere" durationInFrames={195}><Hook /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 15 })} />
      <TransitionSeries.Sequence name="Gap · Moon Base atmosphere" durationInFrames={225}><Gap /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 15 })} />
      <TransitionSeries.Sequence name="Product · the app" durationInFrames={255}><Product /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 15 })} />
      <TransitionSeries.Sequence name="Assistant · cited answers" durationInFrames={180}><Cite /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 15 })} />
      <TransitionSeries.Sequence name="Close · brand" durationInFrames={105}><Close /></TransitionSeries.Sequence>
    </TransitionSeries>
    {/* Space Apps rule: SI-assisted videos carry a visible watermark for their whole length. */}
    <div style={{ position: "absolute", top: 36, right: 40, fontFamily: mono, fontSize: 18, letterSpacing: "0.04em",
      color: "rgba(232,236,243,0.72)", padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(232,236,243,0.22)", background: "rgba(7,9,13,0.55)" }}>
      AI-assisted · built with SI tools
    </div>
  </AbsoluteFill>
);
