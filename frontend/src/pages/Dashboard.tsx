import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Clock, Search } from "lucide-react";
import { api } from "@/services/api";
import { Card, CardHeader, ErrorState, Loading, Stat } from "@/components/ui/primitives";
import { Plot, PALETTE } from "@/components/Plot";
import { useRecentlyViewed } from "@/hooks/useRecentlyViewed";
import { PHASE_LABEL, ROLE_META } from "@/lib/utils";

const VAR_LABEL: Record<string, string> = {
  fuel: "Fuel / material", o2: "O₂ concentration", pressure: "Pressure", flow: "Flow velocity",
  flow_direction: "Flow direction", co2: "CO₂", he: "Helium", burn_time: "Burn time", outcome: "Outcome",
};

const PROMPTS = ["oxygen", "extinction", "flame spread", "smoke", "PMMA", "helium"];

export default function Dashboard() {
  const { data, isLoading, error } = useQuery({ queryKey: ["stats"], queryFn: api.stats });
  const { items: recent } = useRecentlyViewed();
  const [q, setQ] = useState("");
  const nav = useNavigate();

  const search = (term: string) => nav(`/experiments?q=${encodeURIComponent(term)}`);

  return (
    <div className="space-y-6">
      <section className="card relative overflow-hidden px-6 py-8 md:px-10 md:py-10">
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-[radial-gradient(circle,rgba(76,201,240,0.35),rgba(29,63,191,0.08)_55%,transparent_70%)] blur-sm" />
        <div className="pointer-events-none absolute -right-2 top-14 h-3 w-3 rounded-full bg-flame shadow-[0_0_24px_6px_rgba(255,122,26,0.6)] md:right-28" />
        <div className="label text-flame/90">NASA Space Apps 2026 · Flame in Freefall</div>
        <h1 className="mt-3 max-w-3xl text-3xl font-semibold leading-tight tracking-tight md:text-[40px]">
          Decades of microgravity fire research, <span className="text-plasma">searchable, comparable and explainable.</span>
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted md:text-base">
          Flame Intelligence turns NASA's Physical Sciences Informatics combustion archive into fire-safety evidence for
          spacecraft, lunar bases and pressurized rovers — every number traceable to its source table.
        </p>
        <form className="mt-6 flex max-w-xl gap-2" onSubmit={(e) => { e.preventDefault(); search(q); }}>
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input className="input h-11 pl-9" placeholder="Search investigations, fuels, conditions…" value={q}
              onChange={(e) => setQ(e.target.value)} aria-label="Search investigations" />
          </div>
          <button className="btn btn-primary h-11 px-4" type="submit">Explore <ArrowRight className="h-4 w-4" /></button>
        </form>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {PROMPTS.map((p) => (
            <button key={p} onClick={() => search(p)} className="rounded-full border border-line px-2.5 py-1 text-xs text-muted hover:border-plasma/50 hover:text-fg">
              {p}
            </button>
          ))}
        </div>
      </section>

      {isLoading && <Loading label="Loading archive statistics" />}
      {error && <ErrorState error={error} />}
      {data && (
        <>
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Investigations" value={data.n_investigations} accent
              hint={`${data.n_microgravity} in microgravity · ${data.n_ground} ground re-analyses`} />
            <Stat label="Tabulated test rows" value={data.n_test_rows.toLocaleString("en-US")}
              hint={`from ${data.n_with_tables} PSI experimental tables`} />
            <Stat label="Publications" value={data.n_publications}
              hint={`${data.n_dois} with a DOI`} />
            <Stat label="Harmonized variables" value={data.n_harmonized_variables}
              hint="unit-converted, with provenance" />
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader title="What the archive actually measures"
                subtitle="Number of test rows that report each harmonized variable — gaps are shown, not hidden." />
              <div className="px-3 pb-2">
                <Plot height={300}
                  data={[{
                    type: "bar", orientation: "h",
                    y: Object.keys(data.harmonized_counts).map((k) => VAR_LABEL[k] ?? k).reverse(),
                    x: Object.values(data.harmonized_counts).reverse(),
                    marker: { color: Object.keys(data.harmonized_counts).map((_, i) => (i < 4 ? "#4cc9f0" : "#3b6c80")).reverse() },
                    hovertemplate: "%{y}: %{x} of " + data.n_test_rows + " rows<extra></extra>",
                    text: Object.values(data.harmonized_counts).map((v) => `${Math.round((100 * v) / data.n_test_rows)}%`).reverse(),
                    textposition: "outside", cliponaxis: false, textfont: { color: "#8a94a7", size: 11 },
                  }]}
                  layout={{ margin: { l: 120, r: 48, t: 8, b: 32 }, xaxis: { title: { text: "rows reporting the variable" } } }} />
              </div>
            </Card>

            <Card>
              <CardHeader title="Fire-safety role" subtitle="Curated from the challenge statement and PSI objectives" />
              <div className="space-y-2.5 p-5">
                {data.by_role.map((r) => {
                  const m = ROLE_META[r.key];
                  return (
                    <Link key={r.key} to={`/experiments?role=${r.key}`} className="group block">
                      <div className="flex items-baseline justify-between text-sm">
                        <span className="text-fg/90 group-hover:text-fg">{m?.label ?? r.key}</span>
                        <span className="num text-muted">{r.count}</span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-raised">
                        <div className="h-1.5 rounded-full bg-flame/80" style={{ width: `${(100 * r.count) / data.n_investigations}%` }} />
                      </div>
                      <div className="mt-0.5 text-[11px] text-muted">{m?.desc}</div>
                    </Link>
                  );
                })}
              </div>
            </Card>
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader title="Investigation timeline" subtitle={`Start → end dates as reported in PSI (${data.n_investigations - data.timeline.length} investigations without both dates are omitted)`} />
              <div className="px-3 pb-2">
                <Plot height={Math.max(280, data.timeline.length * 20)}
                  data={["solid", "liquid", "gas", "aerosol"].map((phase, i) => {
                    const rows = data.timeline.filter((t) => t.fuel_phase === phase);
                    return {
                      type: "bar", orientation: "h", name: PHASE_LABEL[phase],
                      y: rows.map((r) => r.label),
                      base: rows.map((r) => r.start),
                      x: rows.map((r) => (new Date(r.end as string).getTime() - new Date(r.start).getTime())),
                      marker: { color: PALETTE[i], opacity: 0.85 },
                      customdata: rows.map((r) => [r.start, r.end ?? "n/a", r.project_type]),
                      hovertemplate: "<b>%{y}</b><br>%{customdata[0]} → %{customdata[1]}<br>%{customdata[2]}<extra></extra>",
                    } as Plotly.Data;
                  })}
                  layout={{ barmode: "overlay", xaxis: { type: "date" },
                    yaxis: { autorange: "reversed" }, legend: { orientation: "h", y: -0.08, x: 0, yanchor: "top" }, margin: { l: 110, r: 16, t: 8, b: 64 } }} />
              </div>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader title="Recently viewed" right={<Clock className="h-4 w-4 text-muted" />} />
                <div className="p-3">
                  {recent.length === 0 ? (
                    <p className="px-2 py-3 text-sm text-muted">Investigations you open will appear here.</p>
                  ) : recent.map((r) => (
                    <Link key={r.accession} to={`/experiments/${r.accession}`}
                      className="flex items-center justify-between rounded-lg px-2 py-2 text-sm hover:bg-raised">
                      <span className="truncate">{r.label}</span>
                      <span className="num ml-2 shrink-0 text-xs text-muted">{r.accession}</span>
                    </Link>
                  ))}
                </div>
              </Card>
              <Card>
                <CardHeader title="Why it matters" subtitle="Context from the challenge statement" />
                <ul className="space-y-3 p-5 text-sm">
                  <li><span className="num text-flame">1967</span> <span className="text-fg/90">Apollo 1 — crew lost in a fire in an oxygen-filled cabin during a pre-launch test.</span></li>
                  <li><span className="num text-flame">1970</span> <span className="text-fg/90">Apollo 13 — oxygen tank explosion en route to the Moon.</span></li>
                  <li><span className="num text-flame">1997</span> <span className="text-fg/90">Mir — fire caused by an oxygen generator failure.</span></li>
                  <li className="rounded-lg border border-plasma/30 bg-plasma/5 p-3 text-[13px] text-fg/90">
                    Moon Base and rover cabins are expected at <b className="text-plasma">≥30% O₂ and ≤10.2 psi</b> — more than a 40% increase
                    in oxygen concentration over Earth air, making materials much more flammable.
                  </li>
                </ul>
              </Card>
            </div>
          </section>

          <p className="text-[11px] text-muted">
            Source: {data.source}. Snapshot built {data.built_at.replace("T", " ").replace("+00:00", " UTC")}.
          </p>
        </>
      )}
    </div>
  );
}
