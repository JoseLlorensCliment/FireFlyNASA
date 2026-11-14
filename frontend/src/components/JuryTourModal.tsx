import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Bot, ExternalLink, FlaskConical, GitCompareArrows, ShieldAlert, Sparkles, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const GUIDE_URL = "https://github.com/JoseLlorensCliment/FireFlyNASA/blob/main/docs/01-jury-guide.md";

interface Step { icon: LucideIcon; tone: string; title: string; to: string; cta: string; pitch: string; look: string }

// Figures below are computed from the PSI snapshot (see /api/stats and /api/insights/atmospheres).
const STEPS: Step[] = [
  {
    icon: FlaskConical, tone: "text-flame", title: "Experiment explorer", to: "/experiments", cta: "Open the explorer",
    pitch: "All 24 NASA PSI combustion-science investigations, searchable and filterable by fire-safety role and fuel phase.",
    look: "Open FLEX → Test data: what varied and what was held constant across its 274 tests, with every value traceable to the original PSI cell.",
  },
  {
    icon: GitCompareArrows, tone: "text-plasma", title: "Scientific comparator", to: "/compare?ids=PSI-69,PSI-26", cta: "Compare FLEX vs BASS",
    pitch: "Side-by-side comparison on harmonized variables only — mismatches are flagged automatically.",
    look: "The red “Different fuel phases” warning: liquid droplets vs solid samples must not be compared as like-for-like results.",
  },
  {
    icon: ShieldAlert, tone: "text-ok", title: "The evidence gap for lunar cabins", to: "/safety", cta: "See the atmosphere map",
    pitch: "Of 734 PSI rows reporting ambient O₂ and pressure, only 20 fall in the expected Moon Base cabin atmosphere (≥30% O₂, ≤10.2 psi) — none with solid cabin materials.",
    look: "The shaded Moon Base region on the map and the transparent relevance ranking (adjustable weights, no risk scores).",
  },
  {
    icon: Bot, tone: "text-warn", title: "Grounded AI assistant", to: "/assistant", cta: "Ask a question",
    pitch: "Answers are built only from retrieved NASA sources: every factual sentence must cite [S#], invalid citations are stripped, and evidence is separated from interpretation.",
    look: "Click any [S#] chip: it highlights the source and opens the NASA PDF at the cited page or the PSI record.",
  },
];

export function JuryTourButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button onClick={() => setOpen(true)} aria-haspopup="dialog"
        className={cn("btn h-10 gap-2 border-plasma/40 bg-plasma/[0.08] text-[13px] text-plasma hover:border-plasma/70 hover:bg-plasma/[0.14] hover:text-plasma", className)}>
        <Sparkles className="h-3.5 w-3.5" strokeWidth={1.8} /> Jury guide · Quick tour
      </button>
      {open && createPortal(<JuryTourModal onClose={close} />, document.body)}
    </>
  );
}

export function JuryTourModal({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0);
  const nav = useNavigate();
  const dialog = useRef<HTMLDivElement>(null);
  const step = STEPS[i];
  const Icon = step.icon;

  const go = useCallback((d: number) => setI((x) => Math.min(STEPS.length - 1, Math.max(0, x + d))), []);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";           // no background scroll while the tour is open
    dialog.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "Tab" && dialog.current) {         // keep keyboard focus inside the dialog
        const items = Array.from(dialog.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'));
        if (!items.length) return;
        const first = items[0], lastItem = items[items.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && (active === first || active === dialog.current)) { e.preventDefault(); lastItem.focus(); }
        else if (!e.shiftKey && active === lastItem) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      opener?.focus?.();                                // return focus to the button that opened the tour
    };
  }, [onClose, go]);

  const jump = () => { onClose(); nav(step.to); };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="presentation">
      <div className="absolute inset-0 bg-black/70 [animation:enter-fade_200ms_ease_both]" onClick={onClose} />
      <div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="tour-title"
        className="pop-enter relative w-full max-w-lg rounded-xl border border-line-strong bg-surface shadow-[0_24px_64px_rgb(0_0_0/0.6)] outline-none">
        <div className="flex items-center justify-between border-b border-line/70 px-5 py-3">
          <div className="label text-plasma">Jury quick tour · under 60 s</div>
          <button className="rounded-md p-1 text-muted hover:bg-raised hover:text-fg" aria-label="Close tour" onClick={onClose}><X className="h-4 w-4" /></button>
        </div>

        <div className="px-6 py-6">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl border border-line bg-raised"><Icon className={cn("h-5 w-5", step.tone)} /></span>
            <div>
              <div className="num text-[11px] text-muted">Step {i + 1} of {STEPS.length}</div>
              <h2 id="tour-title" className="text-lg font-semibold">{step.title}</h2>
            </div>
          </div>
          <p className="mt-4 text-[15px] leading-relaxed text-fg/95">{step.pitch}</p>
          <div className="mt-4 rounded-lg border border-line bg-raised/40 p-3 text-[13px] leading-relaxed text-fg/85">
            <span className="label mr-1 text-[10px]">Look for</span> {step.look}
          </div>
          <button className="btn btn-primary mt-5" onClick={jump}>{step.cta} <ArrowRight className="h-4 w-4" /></button>
        </div>

        <div className="flex items-center justify-between border-t border-line/70 px-5 py-3">
          <button className="btn h-8" disabled={i === 0} onClick={() => go(-1)}><ArrowLeft className="h-3.5 w-3.5" /> Back</button>
          <div className="flex gap-1.5" role="group" aria-label="Tour progress">
            {STEPS.map((s, k) => (
              <button key={s.title} onClick={() => setI(k)} aria-label={`Go to step ${k + 1}: ${s.title}`} aria-current={k === i ? "step" : undefined}
                className={cn("h-2 rounded-full transition-all", k === i ? "w-6 bg-flame" : "w-2 bg-line hover:bg-muted")} />
            ))}
          </div>
          {i < STEPS.length - 1
            ? <button className="btn h-8" onClick={() => go(1)}>Next <ArrowRight className="h-3.5 w-3.5" /></button>
            : <button className="btn h-8" onClick={onClose}>Done</button>}
        </div>
        <a href={GUIDE_URL} target="_blank" rel="noreferrer"
          className="flex items-center justify-center gap-1 border-t border-line/70 py-2.5 text-xs text-plasma hover:underline">
          Open the full jury guide (docs/01-jury-guide.md) <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}
