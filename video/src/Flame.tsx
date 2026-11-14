import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { continueRender, delayRender, useCurrentFrame, useVideoConfig } from "remotion";
// The exact renderer the app ships (FlamePhysicsVisualizer): one source of truth for the flame.
import { createWebGLFlame } from "../../frontend/src/components/flame/webglFlame";
import type { FlameRenderer } from "../../frontend/src/components/flame/types";

type Props = {
  width: number;
  height: number;
  /** 0 = microgravity sphere … 1 = Earth teardrop, at this frame. */
  gravity: number;
  yaw?: number;
  pitch?: number;
  /** Backing-store pixels per CSS pixel; the raymarch is costly, the glow hides the upscale. */
  scale?: number;
  style?: React.CSSProperties;
};

/** Every value comes from useCurrentFrame(): no self-running animation, so rendering never flickers. */
export const Flame = ({ width, height, gravity, yaw = 0.55, pitch = 0.22, scale = 0.6, style }: Props) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ref = useRef<HTMLCanvasElement>(null);
  const [r, setR] = useState<FlameRenderer | null>(null);
  const [handle] = useState(() => delayRender("WebGL flame"));

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const renderer = createWebGLFlame(canvas);
    if (renderer) {
      renderer.setDetail?.(44);
      renderer.resize(width, height, scale);
    }
    setR(renderer);
    continueRender(handle);
    return () => renderer?.dispose();
  }, [width, height, scale, handle]);

  useLayoutEffect(() => {
    r?.render({ time: frame / fps, dt: 0, gravity, yaw, pitch });
  }, [r, frame, fps, gravity, yaw, pitch]);

  return <canvas ref={ref} style={{ width, height, display: "block", ...style }} />;
};
