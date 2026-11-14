import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ChevronRight, Clock, Search } from "lucide-react";
import { api } from "@/services/api";
import { Card, CardHeader, ErrorState, Loading, Stat } from "@/components/ui/primitives";
import { INK, Key, Plot, SERIES } from "@/components/Plot";
import { useRecentlyViewed } from "@/hooks/useRecentlyViewed";
import { FlamePhysicsVisualizer } from "@/components/FlamePhysicsVisualizer";
import { EarthSpinoffs } from "@/components/EarthSpinoffs";
import { PHASE_LABEL, ROLE_META } from "@/lib/utils";

const VAR_LABEL: Record<string, string> = {
  fuel: "Fuel / material", o2: "O₂ concentration", pressure: "Pressure", flow: "Flow velocity",
  flow_direction: "Flow direction", co2: "CO₂", he: "Helium", burn_time: "Burn time", outcome: "Outcome",
};

const PROMPTS = ["oxygen", "extinction", "flame spread", "smoke", "PMMA", "helium"];
// Fixed categorical order for fuel phase — the colour follows the phase everywhere, never its rank.
const PHASES = ["solid", "liquid", "gas", "aerosol"] as const;

export default function Dashboard() {
  const { data, isLoading, error } = useQuery({ queryKey: ["stats"], queryFn: api.stats });
  const { items: recent } = useRecentlyViewed();
  const [q, setQ] = useState("");
  const nav = useNavigate();

  const search = (term: string) => nav(`/experiments?q=${encodeURIComponent(term)}`);

  // single series, sorted by magnitude so the gaps read at a glance
  const measured = useMemo(() => {
    if (!data) return [];
    return Object.entries(data.harmonized_counts)
      .map(([k, v]) => ({ key: k, label: VAR_LABEL[k] ?? k, n: v, pct: Math.round((100 * v) / data.n_test_rows) }))
      .sort((a, b) => a.n - b.n); // ascending → largest at the top of a horizontal bar chart
  }, [data]);

  return (
    <div className="page-enter space-y-6">
      <section className="card relative overflow-hidden px-6 py-9 md:px-10 md:py-12">
        <div aria-hidden className="pointer-events-none absolute -right-28 -top-28 h-[22rem] w-[22rem] rounded-full bg-[radial-gradient(circle,rgba(76,201,240,0.28),rgba(29,63,191,0.06)_55%,transparent_70%)]" />
        <div aria-hidden className="pointer-events-none absolute right-16 top-16 hidden h-2.5 w-2.5 rounded-full bg-flame shadow-[0_0_22px_6px_rgba(255,122,26,0.55)] md:block" />
        <div className="relative max-w-3xl">
          <div className="eyebrow">NASA Space Apps 2026 · Flame in Freefall</div>
          <h1 className="display mt-4 text-[32px] sm:text-[40px] md:text-[48px]">
            Decades of microgravity fire research, <span className="text-plasma">searchable, comparable and explainable.</span>
          </h1>
          <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-fg-2">
            Flame Intelligence turns NASA's Physical Sciences Informatics combustion archive into fire-safety evidence for
            spacecraft, lunar bases and pressurized rovers — every number traceable to its source table.
          </p>
          <form className="mt-7 flex max-w-xl flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); search(q); }} role="search">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input className="input h-11 pl-10 text-[15px]" placeholder="Search investigations, fuels, conditions…" value={q}
                onChange={(e) => setQ(e.target.value)} aria-label="Search investigations" />
            </div>
            <button className="btn btn-primary h-11 px-5" type="submit">Explore investigations <ArrowRight className="h-4 w-4" /></button>
          </form>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted">Try</span>
            {PROMPTS.map((p) => <button key={p} onClick={() => search(p)} className="chip">{p}</button>)}
          </div>
        </div>
      </section>

      {isLoading && <Loading label="Loading archive statistics" />}
      {error && <ErrorState error={error} />}
      {data && (
        <>
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Archive at a glance">
            <Stat label="Investigations" value={data.n_investigations} accent
              hint={`${data.n_microgravity} in microgravity · ${data.n_ground} ground re-analyses`} />
            <Stat label="Tabulated test rows" value={data.n_test_rows.toLocaleString("en-US")}
              hint={`from ${data.n_with_tables} PSI experimental tables`} />
            <Stat label="Publications" value={data.n_publications}
              hint={`${data.n_dois} with a DOI`} />
            <Stat label="Harmonized variables" value={data.n_harmonized_variables}
              hint="unit-converted, with provenance" />
          </section>

          <FlamePhysicsVisualizer />

          <section className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader title="What the archive actually measures"
                subtitle={`Rows reporting each harmonized variable, out of ${data.n_test_rows.toLocaleString("en-US")}. Gaps are shown, not hidden.`} />
              <div className="px-4 pb-3 pt-2">
                <Plot height={320} label="Rows reporting each harmonized variable"
                  data={[{
                    type: "bar", orientation: "h",
                    y: measured.map((m) => m.label), x: measured.map((m) => m.n),
                    marker: { color: SERIES[0] },
                    text: measured.map((m) => `${m.pct}%`), textposition: "outside", cliponaxis: false,
                    textfont: { color: INK.muted, size: 11, family: "JetBrains Mono, monospace" },
                    hovertemplate: "<b>%{y}</b><br>%{x:,} of " + data.n_test_rows.toLocaleString("en-US") + " rows (%{text})<extra></extra>",
                  }]}
                  layout={{ bargap: 0.42, margin: { l: 8, r: 44, t: 4, b: 40 },
                    xaxis: { title: { text: "rows reporting the variable" }, showline: false },
                    yaxis: { showgrid: false, tickfont: { color: INK.secondary, size: 12, family: "Inter, sans-serif" } } }}
                  table={{ columns: ["Variable", "Rows", "Share"], rows: [...measured].reverse().map((m) => [m.label, m.n, `${m.pct}%`]) }} />
              </div>
            </Card>

            <Card>
              <CardHeader title="Fire-safety role" subtitle="Curated from the challenge statement and PSI objectives" />
              <ul className="space-y-1 p-3">
                {data.by_role.map((r) => {
                  const m = ROLE_META[r.key];
                  const pct = (100 * r.count) / data.n_investigations;
                  return (
                    <li key={r.key}>
                      <Link to={`/experiments?role=${r.key}`} className="group block rounded-lg px-3 py-2.5 transition-colors duration-200 hover:bg-raised/60">
                        <div className="flex items-baseline justify-between gap-3 text-sm">
                          <span className="font-medium text-fg">{m?.label ?? r.key}</span>
                          <span className="num text-xs text-muted">{r.count}<span className="text-muted/60"> / {data.n_investigations}</span></span>
                        </div>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-flame/15">
                          <div className="h-full rounded-full bg-flame" style={{ width: `${pct}%` }} />
                        </div>
                        <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted">
                          <span>{m?.desc}</span>
                          <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Card>
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader title="Investigation timeline"
                subtitle={`Start → end dates as reported in PSI. ${data.n_investigations - data.timeline.length} investigations without both dates are omitted.`}
                right={<div className="flex flex-wrap gap-x-3 gap-y-1">{PHASES.map((p, i) => <Key key={p} color={SERIES[i]} symbol="square">{PHASE_LABEL[p]}</Key>)}</div>} />
              <div className="px-4 pb-3 pt-2">
                <Plot height={Math.max(300, data.timeline.length * 22 + 56)} label="Investigation timeline by fuel phase"
                  data={PHASES.map((phase, i) => {
                    const rows = data.timeline.filter((t) => t.fuel_phase === phase);
                    return {
                      type: "bar", orientation: "h", name: PHASE_LABEL[phase], showlegend: false,
                      y: rows.map((r) => r.label),
                      base: rows.map((r) => r.start),
                      x: rows.map((r) => (new Date(r.end as string).getTime() - new Date(r.start).getTime())),
                      marker: { color: SERIES[i] },
                      customdata: rows.map((r) => [r.start, r.end ?? "n/a", r.project_type, PHASE_LABEL[phase]]),
                      hovertemplate: "<b>%{y}</b> · %{customdata[3]}<br>%{customdata[0]} → %{customdata[1]}<br>%{customdata[2]}<extra></extra>",
                    } as Plotly.Data;
                  })}
                  layout={{ barmode: "overlay", bargap: 0.38, margin: { l: 8, r: 16, t: 4, b: 36 },
                    xaxis: { type: "date", showline: false },
                    yaxis: { autorange: "reversed", showgrid: false, tickfont: { color: INK.secondary, size: 11, family: "Inter, sans-serif" } } }}
                  table={{ columns: ["Investigation", "Fuel phase", "Start", "End", "Type"],
                    rows: data.timeline.map((t) => [t.label, PHASE_LABEL[t.fuel_phase] ?? t.fuel_phase, t.start, t.end ?? "—", t.project_type]) }} />
              </div>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader title="Recently viewed" right={<Clock className="h-4 w-4 text-muted" />} />
                <div className="p-2">
                  {recent.length === 0 ? (
                    <p className="px-3 py-4 text-sm text-muted">Investigations you open will appear here.</p>
                  ) : (
                    <ul>
                      {recent.map((r) => (
                        <li key={r.accession}>
                          <Link to={`/experiments/${r.accession}`}
                            className="group flex h-10 items-center justify-between gap-2 rounded-lg px-3 text-sm transition-colors duration-200 hover:bg-raised/60">
                            <span className="truncate text-fg">{r.label}</span>
                            <span className="flex shrink-0 items-center gap-1.5">
                              <span className="num text-xs text-muted">{r.accession}</span>
                              <ChevronRight className="h-3.5 w-3.5 text-muted transition-transform duration-200 ease-out-strong group-hover:translate-x-0.5" />
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </Card>
              <Card>
                <CardHeader title="Why it matters" subtitle="Context from the challenge statement" />
                <ol className="relative space-y-4 px-5 pb-5 pt-4 text-sm">
                  <span aria-hidden className="absolute bottom-[5.6rem] left-[1.55rem] top-6 w-px bg-line" />
                  {[
                    ["1967", "Apollo 1 — crew lost in a fire in an oxygen-filled cabin during a pre-launch test."],
                    ["1970", "Apollo 13 — oxygen tank explosion en route to the Moon."],
                    ["1997", "Mir — fire caused by an oxygen generator failure."],
                  ].map(([y, t]) => (
                    <li key={y} className="relative flex gap-3 pl-0">
                      <span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 rounded-full border-2 border-surface bg-flame ring-1 ring-flame/40" />
                      <span><span className="figure mr-1.5 text-fg">{y}</span><span className="text-fg-2">{t}</span></span>
                    </li>
                  ))}
                  <li className="rounded-lg border border-line bg-raised/50 p-3 text-[13px] leading-relaxed text-fg-2">
                    Moon Base and rover cabins are expected at <b className="font-semibold text-fg">≥30% O₂ and ≤10.2 psi</b> — more
                    than a 40% increase in oxygen concentration over Earth air, making materials much more flammable.
                  </li>
                </ol>
              </Card>
            </div>
          </section>

          <EarthSpinoffs />

          <p className="text-[11px] text-muted">
            Source: {data.source}. Snapshot built {data.built_at.replace("T", " ").replace("+00:00", " UTC")}.
          </p>
        </>
      )}
    </div>
  );
}
