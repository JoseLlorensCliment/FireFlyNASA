import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Info, Scale } from "lucide-react";
import { Card, CardHeader, ErrorState, Loading, PageHeader } from "@/components/ui/primitives";
import { AtmosphereMap } from "@/components/AtmosphereMap";
import { Plot, PALETTE } from "@/components/Plot";
import { cn, fmtNum } from "@/lib/utils";

/* eslint-disable @typescript-eslint/no-explicit-any */
async function get<T = any>(path: string): Promise<T> {
  const r = await fetch(`${import.meta.env.VITE_API_URL ?? ""}${path}`);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} — ${path}`);
  return r.json();
}

const OUTCOME_COLOR: Record<string, string> = { Extinction: "#4cc9f0", Disruption: "#ff7a1a", Completion: "#34d399" };

function Method({ method, limitations }: { method: string; limitations?: string[] }) {
  return (
    <details className="group border-t border-line/60 px-5 py-3 text-xs text-muted">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-fg/80 hover:text-fg">
        <Info className="h-3.5 w-3.5 text-plasma" /> Method & limitations
      </summary>
      <p className="mt-2 leading-relaxed">{method}</p>
      {limitations && <ul className="mt-2 space-y-1">{limitations.map((l) => <li key={l}>— {l}</li>)}</ul>}
    </details>
  );
}

function Section({ title, subtitle, children, q }: { title: string; subtitle: ReactNode; children: ReactNode; q: { isLoading: boolean; error: unknown; data?: any } }) {
  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} />
      {q.isLoading && <Loading />}
      {q.error ? <div className="p-4"><ErrorState error={q.error} /></div> : null}
      {q.data && <>{children}<Method method={q.data.method} limitations={q.data.limitations} /></>}
    </Card>
  );
}

function Coverage() {
  const q = useQuery({ queryKey: ["ins-atm"], queryFn: () => get("/api/insights/atmospheres") });
  const d = q.data;
  return (
    <Section q={q} title="Where is the evidence? Tested atmospheres vs exploration atmospheres"
      subtitle="Every PSI row that reports both O₂ and pressure. Shaded: expected Moon Base & rover cabin atmosphere.">
      {d && (
        <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <AtmosphereMap points={d.points} height={440} />
          <div className="space-y-3 text-sm">
            <div className="rounded-lg border border-plasma/30 bg-plasma/5 p-4">
              <div className="label text-plasma">Key finding</div>
              <p className="mt-1.5 leading-relaxed text-fg/90">
                Only <b className="num text-plasma">{d.totals.ambient_rows_in_moon_region}</b> of{" "}
                <span className="num">{d.totals.ambient_rows}</span> ambient-atmosphere rows fall in the expected Moon Base
                atmosphere — all from{" "}
                {d.summary.filter((s: any) => s.in_moon_region > 0).map((s: any) => s.acronym).join(", ") || "none"}.
                No solid cabin-material test in PSI reports per-row O₂ and pressure in that region.
              </p>
            </div>
            <table className="w-full text-xs">
              <thead><tr className="border-b border-line text-left text-muted"><th className="py-1.5">Investigation</th><th className="text-right">ambient rows</th><th className="text-right">in Moon region</th><th className="text-right">max O₂</th></tr></thead>
              <tbody>
                {d.summary.map((s: any) => (
                  <tr key={s.accession} className="border-b border-line/40">
                    <td className="py-1.5"><Link className="hover:text-plasma" to={`/experiments/${s.accession}`}>{s.acronym}</Link></td>
                    <td className="num text-right">{s.n_ambient}</td>
                    <td className={cn("num text-right", s.in_moon_region ? "text-plasma" : "text-muted")}>{s.in_moon_region}</td>
                    <td className="num text-right">{fmtNum(s.max_ambient_o2, 1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[11px] leading-relaxed text-muted">
              Not on the map (no per-row O₂ and pressure): {d.investigations_without_o2_pressure_rows.join(", ")}.
            </p>
          </div>
        </div>
      )}
    </Section>
  );
}

function Flex() {
  const q = useQuery({ queryKey: ["ins-flex"], queryFn: () => get("/api/insights/flex-suppression") });
  const [fuel, setFuel] = useState("Methanol");
  const d = q.data;
  const traces = useMemo(() => {
    if (!d) return [];
    const pts = d.points.filter((p: any) => p.fuel === fuel);
    return Object.keys(OUTCOME_COLOR).map((o) => {
      const s = pts.filter((p: any) => p.outcome === o);
      return {
        type: "scatter", mode: "markers", name: o,
        x: s.map((p: any) => p.o2), y: s.map((p: any) => (p.co2 || 0) + (p.he || 0)),
        marker: { color: OUTCOME_COLOR[o], size: 8, opacity: 0.8, symbol: s.map((p: any) => (p.he > 0 ? "diamond" : p.co2 > 0 ? "square" : "circle")) },
        customdata: s.map((p: any) => [p.diluent, p.pressure, p.burn_time]),
        hovertemplate: "O₂ %{x}% · suppressant %{y}%<br>%{customdata[0]} · %{customdata[1]:.0f} kPa<br>burn time %{customdata[2]} s<extra>" + o + "</extra>",
      } as Plotly.Data;
    });
  }, [d, fuel]);
  return (
    <Section q={q} title="Suppression: FLEX droplet tests by diluent and outcome"
      subtitle="Ambient O₂ vs suppressant fraction (CO₂ or He). Circle = O₂/N₂ only, square = CO₂, diamond = He.">
      {d && (
        <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div>
            <div className="mb-2 flex gap-1 text-xs">
              {["Methanol", "n-Heptane"].map((f) => (
                <button key={f} onClick={() => setFuel(f)} className={cn("rounded-md border px-2.5 py-1", fuel === f ? "border-flame/60 bg-flame/10 text-flame" : "border-line text-muted hover:text-fg")}>{f}</button>
              ))}
            </div>
            <Plot height={360} data={traces}
              layout={{ xaxis: { title: { text: "Ambient O₂ (%)" } }, yaxis: { title: { text: "CO₂ or He in ambient (%)" } }, legend: { orientation: "h", y: 1.1 } }} />
          </div>
          <table className="h-fit w-full text-xs">
            <thead><tr className="border-b border-line text-left text-muted"><th className="py-1.5">Fuel / atmosphere</th><th className="text-right">tests</th><th className="text-right">Ext.</th><th className="text-right">Disr.</th><th className="text-right">Compl.</th></tr></thead>
            <tbody>
              {d.table.map((r: any) => (
                <tr key={r.fuel + r.diluent} className="border-b border-line/40">
                  <td className="py-1.5">{r.fuel}<div className="text-[11px] text-muted">{r.diluent}</div></td>
                  <td className="num text-right">{r.n}</td>
                  <td className="num text-right text-plasma">{r.outcomes.Extinction ?? 0}</td>
                  <td className="num text-right text-flame">{r.outcomes.Disruption ?? 0}</td>
                  <td className="num text-right text-ok">{r.outcomes.Completion ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

function Saffire() {
  const q = useQuery({ queryKey: ["ins-saffire"], queryFn: () => get("/api/insights/saffire-gravity") });
  const cols: [string, string][] = [["sample", "Sample"], ["material", "Material"], ["thickness", "Thickness"], ["direction", "Flow"],
    ["o2", "O₂ %"], ["ug_burn_length", "µg burn length"], ["ug_spread", "µg spread"], ["g1_burn_length", "1-g burn length"], ["g1_spread", "1-g spread"], ["burn_time", "µg burn time"]];
  return (
    <Section q={q} title="Gravity matters: Saffire-II flame spread in microgravity vs normal gravity"
      subtitle="Verbatim values from the PSI table (20 cm/s flow). Several materials burned completely at 1 g but not in microgravity, and vice versa — read with the notes.">
      {q.data && (
        <div className="overflow-x-auto p-2">
          <table className="w-full min-w-[820px] text-xs">
            <thead><tr className="border-b border-line text-left text-muted">{cols.map(([, l]) => <th key={l} className="px-2 py-2 font-medium">{l}</th>)}</tr></thead>
            <tbody>
              {q.data.rows.map((r: any) => (
                <tr key={r.sample} className="border-b border-line/40">
                  {cols.map(([k]) => <td key={k} className={cn("px-2 py-1.5", k.startsWith("ug") && "text-plasma", k.startsWith("g1") && "text-flame")}>{r[k] || <span className="text-muted/50">—</span>}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="mt-2 space-y-0.5 px-2 text-[11px] text-muted">{q.data.notes.map((n: string) => <li key={n}>{n}</li>)}</ul>
        </div>
      )}
    </Section>
  );
}

function Bass2() {
  const q = useQuery({ queryKey: ["ins-bass2"], queryFn: () => get("/api/insights/bass2-products") });
  const traces = useMemo(() => {
    if (!q.data) return [];
    const fams = Array.from(new Set(q.data.points.map((p: any) => p.family))) as string[];
    return fams.map((f, i) => {
      const s = q.data.points.filter((p: any) => p.family === f && p.co_rise !== null);
      return {
        type: "scatter", mode: "markers", name: f, x: s.map((p: any) => p.o2_drop), y: s.map((p: any) => p.co_rise),
        marker: { color: PALETTE[i % PALETTE.length], size: 8, opacity: 0.8, symbol: s.map((p: any) => (p.flag ? "x" : "circle")) },
        text: s.map((p: any) => `${p.test} · ${p.material}${p.flag ? " · " + p.flag : ""}`),
        hovertemplate: "%{text}<br>O₂ drop %{x} pts · CO rise %{y} ppm<extra></extra>",
      } as Plotly.Data;
    });
  }, [q.data]);
  return (
    <Section q={q} title="Combustion products: BASS-II oxygen consumption and CO per test"
      subtitle="Each point is one test in the glovebox (✕ = O₂ drop > 5 points, flagged for manual check).">
      {q.data && <div className="p-3"><Plot height={340} data={traces}
        layout={{ xaxis: { title: { text: "O₂ drop during test (percentage points)" } }, yaxis: { title: { text: "CO rise (ppm)" } }, legend: { orientation: "h", y: 1.12 } }} /></div>}
    </Section>
  );
}

function Relevance() {
  const q = useQuery({ queryKey: ["ins-rel"], queryFn: () => get("/api/insights/relevance") });
  const [scenario, setScenario] = useState("moon");
  const [w, setW] = useState<Record<string, number>>({ safety_role: 3, solid_materials: 2, condition_proximity: 3, quantitative_data: 1, flight_data: 1 });
  const ranked = useMemo(() => {
    if (!q.data) return [];
    const total = Object.values(w).reduce((a, b) => a + b, 0) || 1;
    return q.data.investigations.map((inv: any) => {
      const c = { ...inv.criteria, condition_proximity: inv.condition_proximity[scenario] };
      const score = q.data.criteria.reduce((s: number, cr: any) => s + (w[cr.key] ?? 0) * c[cr.key].value, 0) / total;
      return { ...inv, c, score };
    }).sort((a: any, b: any) => b.score - a.score);
  }, [q.data, w, scenario]);
  return (
    <Section q={q} title="Which investigations matter most for a scenario? (transparent relevance ranking)"
      subtitle="Adjust the weights; every criterion is a documented property of the PSI record. This is relevance of evidence — not a fire-risk score.">
      {q.data && (
        <div className="grid gap-4 p-4 lg:grid-cols-[300px_minmax(0,1fr)]">
          <div className="space-y-4">
            <div>
              <div className="label mb-1.5">Scenario</div>
              <select className="input" value={scenario} onChange={(e) => setScenario(e.target.value)} aria-label="Scenario">
                {q.data.scenarios.map((s: any) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
            {q.data.criteria.map((cr: any) => (
              <label key={cr.key} className="block text-xs">
                <div className="flex justify-between text-fg/90"><span>{cr.label}</span><span className="num text-flame">{w[cr.key]}</span></div>
                <input type="range" min={0} max={5} step={1} value={w[cr.key]} className="mt-1 w-full accent-[#ff7a1a]"
                  onChange={(e) => setW((x) => ({ ...x, [cr.key]: Number(e.target.value) }))} aria-label={`Weight: ${cr.label}`} />
                <div className="mt-0.5 text-[11px] leading-snug text-muted">{cr.desc}</div>
              </label>
            ))}
          </div>
          <div className="max-h-[620px] space-y-1.5 overflow-auto pr-1">
            {ranked.map((r: any, i: number) => (
              <details key={r.accession} className="rounded-lg border border-line bg-raised/40 px-3 py-2">
                <summary className="flex cursor-pointer list-none items-center gap-3">
                  <span className="num w-5 text-xs text-muted">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-sm"><b>{r.acronym ?? r.accession}</b> <span className="text-muted">{r.title}</span></span>
                  <div className="hidden h-1.5 w-28 rounded-full bg-line sm:block"><div className="h-1.5 rounded-full bg-flame" style={{ width: `${r.score * 100}%` }} /></div>
                  <span className="num w-10 text-right text-sm text-flame">{r.score.toFixed(2)}</span>
                </summary>
                <table className="mt-2 w-full text-[11px]">
                  <tbody>
                    {q.data.criteria.map((cr: any) => (
                      <tr key={cr.key} className="border-t border-line/40">
                        <td className="py-1 text-muted">{cr.label}</td>
                        <td className="num py-1 text-right">{r.c[cr.key].value.toFixed(2)}</td>
                        <td className="py-1 pl-3 text-fg/80">{r.c[cr.key].why}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Link to={`/experiments/${r.accession}`} className="mt-1 inline-block text-[11px] text-plasma hover:underline">Open investigation →</Link>
              </details>
            ))}
          </div>
        </div>
      )}
    </Section>
  );
}

export default function Safety() {
  return (
    <div>
      <PageHeader eyebrow="Module 4" title="Safety insights">
        Descriptive analyses of the PSI data for fire prevention, detection and suppression. No arbitrary risk scores: each
        view states how it was computed and what it cannot tell you.
      </PageHeader>
      <div className="mb-5 flex items-start gap-2 rounded-lg border border-line bg-raised/40 p-3 text-xs text-muted">
        <Scale className="mt-0.5 h-4 w-4 shrink-0 text-flame" />
        PSI has no partial-gravity combustion data. Microgravity and 1-g results can only bound lunar and Martian behaviour.
      </div>
      <div className="space-y-5">
        <Coverage />
        <Relevance />
        <Flex />
        <Saffire />
        <Bass2 />
      </div>
    </div>
  );
}
