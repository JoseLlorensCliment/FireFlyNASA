import { Link } from "react-router-dom";
import { ExternalLink, Factory, Flame, ShieldCheck, Wind, type LucideIcon } from "lucide-react";

/**
 * Earth benefits of microgravity combustion research.
 * Every statement is paraphrased from a NASA source shipped with or linked by this project:
 * NASA GRC experiment fact sheets (data/raw/nasa_docs), the challenge statement and its NASA Spinoff resources.
 */
interface Benefit {
  icon: LucideIcon;
  tone: string;
  title: string;
  investigations: { acc: string; label: string }[];
  insight: string;
  earth: string;
  sources: { label: string; url: string }[];
}

const BENEFITS: Benefit[] = [
  {
    icon: Factory, tone: "text-flame",
    title: "Cleaner, more efficient combustion",
    investigations: [{ acc: "PSI-10", label: "ACME Flame Design" }, { acc: "PSI-23", label: "ACME s-Flame" }, { acc: "PSI-159", label: "ACME CFI-G" }],
    insight: "Without buoyancy, gaseous flames become simple enough to test detailed chemistry and soot-formation models, from very sooty to near-extinction conditions.",
    earth: "ACME's primary goal is improving efficiency and reducing pollutant emissions — including soot — in practical combustion on Earth, through better predictive models for combustor design.",
    sources: [{ label: "NASA GRC ACME fact sheet", url: "https://www.nasa.gov/wp-content/uploads/2025/07/advanced-combustion-via-microgravity-experiments-acme.pdf" }],
  },
  {
    icon: Wind, tone: "text-plasma",
    title: "Smarter smoke detection",
    investigations: [{ acc: "PSI-102", label: "SAME" }, { acc: "PSI-101", label: "SAME-R" }, { acc: "PSI-47", label: "DAFT" }],
    insight: "Smoke particles formed in microgravity can be larger than those formed on Earth, and detectors are tuned to particular particle sizes.",
    earth: "Measured particle sizes guide more accurate detector design. A NASA smoke detector built for the Shuttle to tell smoke from dust — fewer nuisance alarms — found industrial uses such as mining.",
    sources: [
      { label: "NASA GRC SAME fact sheet", url: "https://www.nasa.gov/wp-content/uploads/2025/07/smoke-aerosol-measurement-experiment-same.pdf" },
      { label: "NASA Spinoff: Fire Detector", url: "https://spinoff.nasa.gov/node/9407" },
    ],
  },
  {
    icon: ShieldCheck, tone: "text-ok",
    title: "Fire suppression without guesswork",
    investigations: [{ acc: "PSI-69", label: "FLEX" }, { acc: "PSI-68", label: "FLEX-2" }, { acc: "PSI-26", label: "BASS" }],
    insight: "FLEX measured how CO₂ and helium dilution extinguish burning fuel droplets; BASS tested an inert nitrogen suppressant on burning solids.",
    earth: "Suppressant-efficacy data and validated models support extinguisher design; fine-water-mist extinguishers developed for the ISS have practical applications on Earth.",
    sources: [
      { label: "NASA GRC FLEX fact sheet", url: "https://www.nasa.gov/wp-content/uploads/2025/07/flame-extinguishment-experiment-flex.pdf" },
      { label: "Challenge statement (water mist)", url: "https://www.spaceappschallenge.org/2026/challenges/flame-in-freefall/" },
    ],
  },
  {
    icon: Flame, tone: "text-warn",
    title: "Safer materials and firefighter gear",
    investigations: [{ acc: "PSI-98", label: "Saffire-I" }, { acc: "PSI-99", label: "Saffire-II" }, { acc: "PSI-25", label: "BASS-II" }],
    insight: "Flame spread over fabrics, plastics and silicone (SIBAL, Nomex, PMMA) was measured in microgravity — Saffire at up to ~1 m sample scale inside a Cygnus vehicle.",
    earth: "Material-flammability knowledge informs material selection; NASA spacesuit technology has also improved firefighters' protective clothing and breathing air tanks.",
    sources: [
      { label: "NASA Spinoff: Fire Attire", url: "https://spinoff.nasa.gov/node/9918" },
      { label: "NASA Spinoff: Fireman's Air Tanks", url: "https://spinoff.nasa.gov/node/9582" },
    ],
  },
];

export function EarthSpinoffs() {
  return (
    <section className="card" aria-labelledby="spinoffs-title">
      <div className="border-b border-line/70 px-5 py-4">
        <div className="eyebrow text-ok">Back on Earth</div>
        <h3 id="spinoffs-title" className="mt-1.5 text-[15px] font-semibold tracking-[-0.01em]">How microgravity fire research pays off on the ground</h3>
        <p className="mt-1 text-xs text-muted">Each card links to the PSI investigations behind it and to the NASA source of the claim.</p>
      </div>
      <div className="grid gap-3 p-4 md:grid-cols-2">
        {BENEFITS.map((b) => {
          const Icon = b.icon;
          return (
            <article key={b.title} className="card-inset flex flex-col p-5">
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line bg-surface">
                  <Icon className={`h-[18px] w-[18px] ${b.tone}`} strokeWidth={1.8} />
                </span>
                <h4 className="text-[15px] font-semibold tracking-[-0.01em]">{b.title}</h4>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {b.investigations.map((i) => (
                  <Link key={i.acc} to={`/experiments/${i.acc}`} className="chip min-h-[26px] px-2.5 text-[11px]">
                    {i.label} <span className="num text-muted">{i.acc}</span>
                  </Link>
                ))}
              </div>
              <dl className="mt-4 space-y-3 text-[13px] leading-relaxed">
                <div>
                  <dt className="label text-[10px]">In microgravity</dt>
                  <dd className="mt-1 text-fg-2">{b.insight}</dd>
                </div>
                <div className="border-l-2 border-line-strong pl-3">
                  <dt className={`label text-[10px] ${b.tone}`}>On Earth</dt>
                  <dd className="mt-1 text-fg">{b.earth}</dd>
                </div>
              </dl>
              <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line/70 pt-3 text-[11px]" style={{ marginTop: "1rem" }}>
                <span className="text-muted">Sources</span>
                {b.sources.map((src) => (
                  <a key={src.url} href={src.url} target="_blank" rel="noreferrer" className="link inline-flex items-center gap-1">
                    {src.label} <ExternalLink className="h-3 w-3" />
                  </a>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
