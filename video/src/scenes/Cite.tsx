import { AbsoluteFill, useCurrentFrame } from "remotion";
import { C, easeOut, mono, sans } from "../theme";
import { Backdrop, Eyebrow, Headline, Rise } from "../ui";

// A real retrieval from the app's RAG index (public/data/ask_example.json, source S4).
const Q = "How does oxygen concentration affect flame extinction in microgravity?";
const SRC = { id: "S4", title: "A Researcher's Guide to: Combustion Science (ISS, 2015)", page: 10, kind: "NASA document",
  quote: "an improved knowledge of combustion in reduced gravity is essential to adapt fire safety concepts" };

/** 0:21 – 0:26 · The assistant answers from NASA sources and every claim links to its page. */
export const Cite = () => {
  const f = useCurrentFrame();
  const typed = Q.slice(0, Math.floor(Math.max(0, f - 6) * 2.2));
  const card = easeOut((f - 70) / 22);
  const pulse = f > 58 && f < 80 ? 1 + 0.12 * Math.sin(((f - 58) / 22) * Math.PI) : 1;
  return (
    <AbsoluteFill>
      <Backdrop glow={C.plasma} x="65%" y="55%" />
      <AbsoluteFill style={{ padding: "120px 0 0 140px" }}>
        <Rise at={0}><Eyebrow color={C.plasma}>Research assistant</Eyebrow></Rise>
        <Rise at={4}><Headline size={84} style={{ marginTop: 22 }}>Answers from NASA sources.<br /><span style={{ color: C.fg2 }}>Every claim cited.</span></Headline></Rise>
      </AbsoluteFill>
      <div style={{ position: "absolute", left: 140, top: 470, width: 1640 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20, padding: "26px 30px", borderRadius: 18, border: `1px solid ${C.lineStrong}`, background: C.surface }}>
          <div style={{ fontFamily: mono, fontSize: 20, color: C.flame, border: `1px solid ${C.flame}55`, borderRadius: 8, padding: "4px 10px" }}>Q</div>
          <div style={{ fontFamily: sans, fontSize: 36, color: C.fg }}>{typed}<span style={{ opacity: f % 30 < 15 && typed.length < Q.length ? 1 : 0, color: C.plasma }}>|</span></div>
        </div>
        <div style={{ display: "flex", gap: 36, marginTop: 34, alignItems: "flex-start" }}>
          <Rise at={44} style={{ width: 760 }}>
            <div style={{ fontFamily: sans, fontSize: 32, lineHeight: 1.5, color: C.fg2 }}>
              Reduced-gravity combustion knowledge is needed to adapt spacecraft fire-safety systems{" "}
              <span style={{ display: "inline-block", transform: `scale(${pulse})`, fontFamily: mono, fontSize: 22, color: C.plasma, border: `1px solid ${C.plasma}66`, background: `${C.plasma}14`, borderRadius: 7, padding: "1px 8px", verticalAlign: "middle" }}>{SRC.id}</span>
            </div>
          </Rise>
          <div style={{ flex: 1, opacity: card, transform: `translateX(${(1 - card) * 40}px)`, padding: 30, borderRadius: 18, border: `1px solid ${C.plasma}88`, background: `${C.plasma}0d` }}>
            <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
              <span style={{ fontFamily: mono, fontSize: 20, color: C.plasma, border: `1px solid ${C.plasma}66`, borderRadius: 7, padding: "2px 8px" }}>{SRC.id}</span>
              <span style={{ fontFamily: sans, fontSize: 28, fontWeight: 600, color: C.fg }}>{SRC.title}</span>
            </div>
            <div style={{ fontFamily: mono, fontSize: 20, color: C.muted, marginTop: 12 }}>{SRC.kind} · page {SRC.page}</div>
            <div style={{ fontFamily: sans, fontSize: 26, lineHeight: 1.45, color: C.fg2, marginTop: 18 }}>“…{SRC.quote}…”</div>
            <div style={{ fontFamily: sans, fontSize: 24, color: C.plasma, marginTop: 18 }}>Open PDF at p. {SRC.page} ↗</div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
