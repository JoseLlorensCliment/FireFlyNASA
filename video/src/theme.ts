import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";

// Same tokens as the Flame Intelligence app (frontend/src/index.css), so the film and the product read as one system.
export const C = {
  bg: "#07090d",
  surface: "#0e121a",
  raised: "#151b26",
  line: "#1f2633",
  lineStrong: "#2e384a",
  fg: "#e8ecf3",
  fg2: "#b4bccb",
  muted: "#8590a3",
  flame: "#ff7a1a",
  plasma: "#4cc9f0",
  series: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#0ca30c"],
};

export const sans = loadInter("normal", { weights: ["400", "500", "600", "700"], subsets: ["latin"] }).fontFamily;
export const mono = loadMono("normal", { weights: ["400", "500"], subsets: ["latin"] }).fontFamily;

// Emil Kowalski's strong ease-out, as a plain function for interpolate().
export const easeOut = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 4);
