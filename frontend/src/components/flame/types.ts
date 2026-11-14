export interface FlameFrame {
  time: number;     // seconds of animation time
  dt: number;       // seconds since the previous frame (0 for a still redraw)
  gravity: number;  // 0 (microgravity) … 1 (Earth), already eased
  yaw: number;      // camera orbit angles in radians (ignored by the 2D fallback)
  pitch: number;
}

export interface FlameRenderer {
  kind: "webgl" | "2d";
  /** cssW/cssH in CSS pixels; scale = backing-store pixels per CSS pixel (adaptive quality). */
  resize(cssW: number, cssH: number, scale: number): void;
  render(frame: FlameFrame): void;
  /** Optional detail knob (WebGL: raymarch steps). */
  setDetail?(n: number): void;
  getDetail?(): number;
  dispose(): void;
}
