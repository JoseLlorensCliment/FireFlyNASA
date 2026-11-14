import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import * as Tabs from "@radix-ui/react-tabs";
import { ArrowLeft, ExternalLink, Info } from "lucide-react";
import { api } from "@/services/api";
import { Badge, Card, CardHeader, ErrorState, Loading, RoleBadge } from "@/components/ui/primitives";
import { Plot, SERIES, SYMBOLS, marker } from "@/components/Plot";
import { useRecentlyViewed } from "@/hooks/useRecentlyViewed";
import type { InvestigationDetail, Quantity, TableInfo, TestRow } from "@/types/api";
import { cn, fmtBytes, fmtNum, PHASE_LABEL, QUALITY_META } from "@/lib/utils";

const HARMONIZED: { key: string; label: string; unit?: string }[] = [
  { key: "fuel", label: "Fuel family" },
  { key: "o2", label: "O₂", unit: "%" },
  { key: "pressure", label: "Pressure", unit: "kPa" },
  { key: "flow", label: "Flow", unit: "cm/s" },
  { key: "flow_direction", label: "Flow dir." },
  { key: "co2", label: "CO₂", unit: "%" },
  { key: "he", label: "He", unit: "%" },
  { key: "burn_time", label: "Burn time", unit: "s" },
  { key: "outcome", label: "Outcome" },
];

const KIND_LABEL: Record<string, string> = {
  test: "one row per test", test_day: "one row per test day (summary)", condition_set: "test-condition matrix (not individual tests)",
  session: "one row per session", data_index: "index of published datasets",
};

function Text({ title, body }: { title: string; body: string | null }) {
  if (!body) return null;
  return (
    <div>
      <div className="label mb-2">{title}</div>
      <div className="prose-sci whitespace-pre-line text-sm">{body.trim()}</div>
    </div>
  );
}

function QCell({ q, unit }: { q: Quantity | string | null | undefined; unit?: string }) {
  if (q === null || q === undefined || q === "") return <span className="text-muted/50">—</span>;
  if (typeof q === "string") return <span>{q}</span>;
  const meta = QUALITY_META[q.quality] ?? { label: q.quality, tone: "text-muted" };
  if (q.value === null) {
    return <span className="text-muted/60" title={`Original: "${q.raw}" — ${meta.label}`}>{q.raw ? "n/r" : "—"}</span>;
  }
  const isRange = q.min !== null && q.max !== null && q.min !== q.max;
  return (
    <span title={`Original cell: "${q.raw}" · ${meta.label}`} className="whitespace-nowrap">
      <span className="num">{isRange ? `${fmtNum(q.min)}–${fmtNum(q.max)}` : fmtNum(q.value)}</span>
      {unit && <span className="ml-0.5 text-[10px] text-muted">{unit}</span>}
      {q.quality !== "measured" && <span className={cn("ml-1 text-[10px]", meta.tone)}>{meta.label}</span>}
    </span>
  );
}

function ColumnSummaryView({ t }: { t: TableInfo }) {
  const varies = t.column_summary.filter((c) => c.status === "varies");
  const constant = t.column_summary.filter((c) => c.status === "constant");
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div>
        <div className="label mb-2 text-flame/90">What varies between rows ({varies.length})</div>
        <ul className="space-y-1.5 text-xs">
          {varies.map((c) => (
            <li key={c.column} className="flex justify-between gap-3 rounded-md bg-raised/60 px-2.5 py-1.5">
              <span className="text-fg/90">{c.column}</span>
              <span className="num shrink-0 text-muted">
                {c.numeric_min !== null ? `${fmtNum(c.numeric_min)} → ${fmtNum(c.numeric_max)}` : `${c.distinct} distinct`}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <div className="label mb-2">Held constant ({constant.length})</div>
        <ul className="space-y-1.5 text-xs">
          {constant.length === 0 && <li className="text-muted">No column is constant across all rows.</li>}
          {constant.map((c) => (
            <li key={c.column} className="flex justify-between gap-3 rounded-md bg-raised/60 px-2.5 py-1.5">
              <span className="text-fg/90">{c.column}</span>
              <span className="num truncate text-muted">{c.example_values[0]}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function TablePanel({ acc, t }: { acc: string; t: TableInfo }) {
  const [raw, setRaw] = useState(false);
  const [page, setPage] = useState(0);
  const size = 50;
  const { data, isLoading, error } = useQuery({
    queryKey: ["tests", acc, t.table, page],
    queryFn: () => api.tests(acc, t.table, size, page * size),
  });
  const all = useQuery({ queryKey: ["tests-all", acc, t.table], queryFn: () => api.tests(acc, t.table, 2000, 0) });

  const cols = useMemo(() => {
    if (!data) return [];
    return HARMONIZED.filter((h) => data.items.some((r) => r.provenance[h.key]));
  }, [data]);

  const chart = useMemo(() => {
    const rows = all.data?.items ?? [];
    const pts = rows.filter((r) => r.o2 !== null && r.pressure !== null);
    if (pts.length < 3) return null;
    // Categorical groups in a fixed slot order (by frequency); colour + marker shape (composite encoding) because
    // scatter plots only clear the colour-blind gates for 3 hues; beyond 6 groups the tail folds into "Other".
    const key = (r: TestRow) => r.outcome ?? r.fuel ?? "rows";
    const counts = new Map<string, number>();
    pts.forEach((r) => counts.set(key(r), (counts.get(key(r)) ?? 0) + 1));
    const ranked = [...counts.keys()].sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0));
    const kept = ranked.slice(0, ranked.length > 6 ? 5 : 6);
    const groupOf = (r: TestRow) => (kept.includes(key(r)) ? key(r) : "Other");
    const groups = [...kept, ...(ranked.length > kept.length ? ["Other"] : [])];
    return groups.map((g, i) => {
      const s = pts.filter((r) => groupOf(r) === g);
      const color = g === "Other" ? "#6b7488" : SERIES[i];
      return {
        type: "scatter", mode: "markers", name: g,
        x: s.map((r) => r.o2), y: s.map((r) => r.pressure),
        marker: marker(color, { symbol: SYMBOLS[i % SYMBOLS.length], opacity: 0.9 }),
        text: s.map((r) => `${r.fuel_raw ?? ""}`),
        hovertemplate: "<b>" + g + "</b><br>O₂ %{x:.1f}% · %{y:.0f} kPa<br>%{text}<extra></extra>",
      } as Plotly.Data;
    });
  }, [all.data]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title={<span className="num">{t.source_file.split("/").pop()}</span>}
          subtitle={<>{t.n_rows} rows · {KIND_LABEL[t.kind] ?? t.kind} · encoding {t.encoding}</>}
        />
        <div className="space-y-4 p-5">
          {t.curator_note && (
            <div className="flex gap-2 rounded-lg border border-warn/30 bg-warn/5 p-3 text-xs text-fg/90">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" /> <span><b>Data note:</b> {t.curator_note}</span>
            </div>
          )}
          {t.notes.length > 0 && (
            <ul className="space-y-1 rounded-lg border border-line bg-raised/40 p-3 text-xs text-muted">
              {t.notes.map((n) => <li key={n}>{n}</li>)}
            </ul>
          )}
          <ColumnSummaryView t={t} />
        </div>
      </Card>

      {chart && (
        <Card>
          <CardHeader title="Test conditions: O₂ vs pressure" subtitle="Each point is one row, coloured by reported outcome (or fuel). Values harmonized to % and kPa." />
          <div className="px-4 pb-3 pt-2">
            <Plot height={340} data={chart} label="Test conditions: oxygen versus pressure"
              layout={{ xaxis: { title: { text: "O₂ (%)" } }, yaxis: { title: { text: "Pressure (kPa)" } },
                legend: { orientation: "h", y: 1.02, x: 0, yanchor: "bottom" }, margin: { l: 56, r: 16, t: 36, b: 48 } }}
              table={{ columns: ["Row", "Fuel / sample", "O₂ (%)", "Pressure (kPa)", "Outcome"],
                rows: (all.data?.items ?? []).filter((r) => r.o2 !== null && r.pressure !== null)
                  .map((r) => [r.row_index + 1, r.fuel_raw ?? "—", Number(r.o2?.toFixed(2)), Number(r.pressure?.toFixed(1)), r.outcome ?? "—"]) }} />
          </div>
        </Card>
      )}

      <Card>
        <CardHeader title="Rows"
          subtitle={raw ? "Original PSI columns, verbatim." : "Harmonized view — hover a value to see the original cell and its quality flag."}
          right={
            <div className="seg" role="group" aria-label="Row view">
              <button aria-pressed={!raw} onClick={() => setRaw(false)}>Harmonized</button>
              <button aria-pressed={raw} onClick={() => setRaw(true)}>Original</button>
            </div>
          } />
        {isLoading && <Loading />}
        {error && <div className="p-4"><ErrorState error={error} /></div>}
        {data && (
          <>
            <div className="max-h-[520px] overflow-auto">
              <table className="data-table">
                <thead>
                  <tr className="border-b border-line">
                    <th className="px-3 py-2 font-medium text-muted">#</th>
                    {raw
                      ? t.columns.filter(Boolean).map((c) => <th key={c} className="whitespace-nowrap px-3 py-2 font-medium text-muted">{c}</th>)
                      : <>
                          <th className="px-3 py-2 font-medium text-muted">Fuel / sample (original)</th>
                          {cols.map((c) => (
                            <th key={c.key} className="whitespace-nowrap px-3 py-2 font-medium text-muted"
                              title={`Source column: ${data.items[0]?.provenance[c.key] ?? ""}`}>
                              {c.label}{c.unit && <span className="ml-1 text-[10px]">({c.unit})</span>}
                            </th>
                          ))}
                        </>}
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((r: TestRow) => (
                    <tr key={r.id}>
                      <td className="num px-3 py-1.5 text-muted">{r.row_index + 1}</td>
                      {raw
                        ? t.columns.filter(Boolean).map((c) => <td key={c} className="whitespace-nowrap px-3 py-1.5">{r.raw[c] || <span className="text-muted/40">·</span>}</td>)
                        : <>
                            <td className="max-w-[240px] truncate px-3 py-1.5 text-fg/90" title={r.fuel_raw ?? ""}>{r.fuel_raw ?? "—"}</td>
                            {cols.map((c) => (
                              <td key={c.key} className="px-3 py-1.5">
                                {c.key === "fuel" ? (r.fuel ?? <span className="text-muted/60" title="No known fuel family matched the original text">unclassified</span>)
                                  : <QCell q={r.harmonized[c.key] as Quantity | string | null} unit={c.unit} />}
                              </td>
                            ))}
                          </>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.total > size && (
              <div className="flex items-center justify-between border-t border-line px-4 py-2 text-xs text-muted">
                <span className="num">{page * size + 1}–{Math.min((page + 1) * size, data.total)} of {data.total}</span>
                <div className="flex gap-2">
                  <button className="btn h-8" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</button>
                  <button className="btn h-8" disabled={(page + 1) * size >= data.total} onClick={() => setPage((p) => p + 1)}>Next</button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

function Overview({ inv }: { inv: InvestigationDetail }) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="space-y-6 p-6 lg:col-span-2">
        <Text title="Objectives" body={inv.objectives} />
        <Text title="Approach" body={inv.approach} />
        <Text title="Hypothesis" body={inv.hypothesis} />
        <Text title="Research impacts / Earth benefits" body={inv.research_impacts} />
      </Card>
      <div className="space-y-4">
        <Card>
          <CardHeader title="Facts" />
          <dl className="divide-y divide-line/60 text-sm">
            {[
              ["Project type", inv.project_type],
              ["Platform", inv.flight_platform],
              ["Period", `${inv.start_date ?? "?"} → ${inv.end_date ?? "?"}`],
              ["Hardware", inv.hardware],
              ["Hardware family", inv.hardware_family],
              ["NASA center", inv.nasa_center],
              ["PSI sub-area", inv.sub_research_area],
              ["Data volume (PSI)", fmtBytes(inv.total_file_size)],
              ["License", inv.license],
            ].filter(([, v]) => v).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 px-5 py-2.5">
                <dt className="text-muted">{k}</dt><dd className="text-right text-fg/90">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>
        <Card className="p-5 text-xs">
          <div className="label mb-2">Classification basis</div>
          <p className="leading-relaxed text-muted">{inv.curation_basis ?? "Not curated."}</p>
          {inv.record_source !== "psi_detail" && (
            <p className="mt-2 text-warn">Detail record unavailable from PSI at build time; fields come from the PSI search index.</p>
          )}
        </Card>
        {inv.related.length > 0 && (
          <Card>
            <CardHeader title="Related investigations" />
            <div className="p-2">
              {inv.related.map((r) => (
                <Link key={r.accession} to={`/experiments/${r.accession}`} className="flex h-10 items-center justify-between rounded-lg px-3 text-sm transition-colors duration-200 hover:bg-raised/60">
                  <span className="truncate">{r.acronym ?? r.title}</span><span className="num ml-2 text-xs text-muted">{r.accession}</span>
                </Link>
              ))}
            </div>
          </Card>
        )}
        {inv.contacts.length > 0 && (
          <Card className="p-5 text-sm">
            <div className="label mb-2">Contacts</div>
            {inv.contacts.map((c) => <div key={c.name} className="text-fg/90">{c.name} <span className="text-muted">· {c.affiliation}</span></div>)}
          </Card>
        )}
      </div>
    </div>
  );
}

export default function ExperimentDetail() {
  const { accession = "" } = useParams();
  const { data: inv, isLoading, error } = useQuery({ queryKey: ["investigation", accession], queryFn: () => api.investigation(accession) });
  const { push } = useRecentlyViewed();
  useEffect(() => { if (inv) push(inv.accession, inv.acronym ?? inv.title); }, [inv, push]);

  if (isLoading) return <Loading label="Loading investigation" />;
  if (error) return <ErrorState error={error} />;
  if (!inv) return null;

  const tabCls = "inline-flex h-9 items-center rounded-md px-3.5 text-sm text-muted transition-colors duration-200 hover:text-fg data-[state=active]:bg-raised data-[state=active]:text-fg data-[state=active]:shadow-[0_1px_2px_rgb(0_0_0/0.4)]";
  return (
    <div className="page-enter">
      <Link to="/experiments" className="group mb-5 inline-flex h-8 items-center gap-1.5 text-xs text-muted transition-colors duration-200 hover:text-fg">
        <ArrowLeft className="h-3.5 w-3.5 transition-transform duration-200 ease-out-strong group-hover:-translate-x-0.5" /> All experiments
      </Link>
      <header className="mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="num text-xs text-muted">{inv.accession}</span>
          <Badge className={inv.project_type?.startsWith("Micro") ? "border-plasma/40 text-plasma" : ""}>{inv.project_type}</Badge>
          {inv.fuel_phase && <Badge>{PHASE_LABEL[inv.fuel_phase]}</Badge>}
          {inv.roles.map((r) => <RoleBadge key={r} role={r} />)}
        </div>
        <h1 className="display mt-3 text-[26px] md:text-[32px]">
          {inv.acronym && <span className="text-flame">{inv.acronym} · </span>}{inv.title}
        </h1>
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <a className="btn h-8" href={inv.psi_url} target="_blank" rel="noreferrer">Open in NASA PSI <ExternalLink className="h-3 w-3" /></a>
          {inv.doi && <a className="btn h-8" href={`https://doi.org/${inv.doi}`} target="_blank" rel="noreferrer">Dataset DOI {inv.doi} <ExternalLink className="h-3 w-3" /></a>}
          {inv.hardware_link && <a className="btn h-8" href={inv.hardware_link} target="_blank" rel="noreferrer">Hardware <ExternalLink className="h-3 w-3" /></a>}
        </div>
        {inv.tags.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{inv.tags.map((t) => <Badge key={t}>{t}</Badge>)}</div>}
      </header>

      <Tabs.Root defaultValue="overview">
        <Tabs.List className="mb-5 flex flex-wrap gap-1 rounded-lg border border-line bg-surface p-1" aria-label="Investigation sections">
          <Tabs.Trigger value="overview" className={tabCls}>Overview</Tabs.Trigger>
          <Tabs.Trigger value="data" className={tabCls}>Test data <span className="num ml-1 text-xs">({inv.n_tests})</span></Tabs.Trigger>
          <Tabs.Trigger value="pubs" className={tabCls}>Publications <span className="num ml-1 text-xs">({inv.publications.length})</span></Tabs.Trigger>
          <Tabs.Trigger value="files" className={tabCls}>PSI files</Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="overview"><Overview inv={inv} /></Tabs.Content>

        <Tabs.Content value="data" className="space-y-6">
          {inv.tables.length === 0 && (
            <Card className="p-6 text-sm text-muted">PSI does not provide an experimental table for this investigation. Its findings are available through the publications and documents.</Card>
          )}
          {inv.tables.map((t) => <TablePanel key={t.table} acc={inv.accession} t={t} />)}
        </Tabs.Content>

        <Tabs.Content value="pubs">
          <Card>
            <ul className="divide-y divide-line/60">
              {inv.publications.length === 0 && <li className="p-5 text-sm text-muted">No publications listed in PSI.</li>}
              {inv.publications.map((p, i) => (
                <li key={i} className="px-5 py-3">
                  <div className="text-sm text-fg/90">{p.title}</div>
                  <div className="mt-0.5 text-xs text-muted">{p.authors}</div>
                  {p.doi && <a className="num mt-1 inline-flex items-center gap-1 text-xs text-plasma hover:underline" href={`https://doi.org/${p.doi}`} target="_blank" rel="noreferrer">doi:{p.doi} <ExternalLink className="h-3 w-3" /></a>}
                </li>
              ))}
            </ul>
          </Card>
        </Tabs.Content>

        <Tabs.Content value="files">
          <Card>
            <CardHeader title="Files added in the latest PSI version" subtitle="Raw data (video, archives) is browsable on PSI; this app uses tables and documents." />
            {inv.file_categories.length === 0 ? (
              <p className="p-5 text-sm text-muted">The latest version did not add files (earlier versions hold the data). Browse everything on PSI.</p>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {inv.file_categories.map((c) => (
                    <tr key={c.category} className="border-b border-line/50">
                      <td className="px-5 py-2.5">{c.category}</td>
                      <td className="num px-5 py-2.5 text-right text-muted">{c.n} files</td>
                      <td className="num px-5 py-2.5 text-right text-muted">{fmtBytes(c.bytes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
