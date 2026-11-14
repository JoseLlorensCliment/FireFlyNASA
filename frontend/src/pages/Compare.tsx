import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertOctagon, AlertTriangle, Check, Info, Plus, X } from "lucide-react";
import { api } from "@/services/api";
import { Badge, Card, CardHeader, ErrorState, Loading, PageHeader } from "@/components/ui/primitives";
import { AtmosphereMap } from "@/components/AtmosphereMap";
import { INK, Plot, SERIES, SURFACE, SYMBOLS } from "@/components/Plot";
import type { CompareResult, CompareVariable } from "@/types/api";
import { cn, fmtNum, QUALITY_META } from "@/lib/utils";

const PRESETS = [
  { label: "Solid flammability: BASS-II vs Saffire-II", ids: ["PSI-25", "PSI-99"] },
  { label: "Suppression: FLEX vs BASS", ids: ["PSI-69", "PSI-26"] },
  { label: "Oxygen-enriched flames: CFI-G vs Flame Design", ids: ["PSI-159", "PSI-10"] },
  { label: "Smoke detection: SAME vs SAME-R", ids: ["PSI-102", "PSI-101"] },
  { label: "Droplets: FLEX vs FLEX-2 vs CFI", ids: ["PSI-69", "PSI-68", "PSI-39"] },
];

const STATUS: Record<CompareVariable["status"], { label: string; cls: string; help: string }> = {
  comparable: { label: "comparable", cls: "text-ok border-ok/40 bg-ok/10", help: "Reported by all, same definition and measured values." },
  caution: { label: "use with care", cls: "text-warn border-warn/40 bg-warn/10", help: "Reported by all, but includes approximate/derived/set-point values or different definitions." },
  partial: { label: "partial", cls: "text-plasma border-plasma/40 bg-plasma/10", help: "Not reported by every selected investigation." },
  not_reported: { label: "not reported", cls: "text-muted border-line", help: "No selected investigation reports this variable." },
  not_comparable: { label: "not comparable", cls: "text-ember border-ember/40 bg-ember/10", help: "Definition depends on the experimental configuration, which differs here." },
  different: { label: "no overlap", cls: "text-ember border-ember/40 bg-ember/10", help: "Reported by all, but no shared value." },
};

const WARN_ICON = { critical: AlertOctagon, warning: AlertTriangle, info: Info };
const WARN_CLS = { critical: "border-ember/35 bg-ember/[0.06]", warning: "border-warn/30 bg-warn/[0.05]", info: "border-line bg-raised/40" };
const WARN_ICON_CLS = { critical: "text-ember", warning: "text-warn", info: "text-plasma" };

export function Picker({ selected, onChange }: { selected: string[]; onChange: (ids: string[]) => void }) {
  const { data } = useQuery({ queryKey: ["investigations", {}], queryFn: () => api.investigations({ sort: "name" }) });
  const [open, setOpen] = useState(false);
  const label = (acc: string) => data?.find((d) => d.accession === acc)?.acronym ?? acc;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {selected.map((acc, i) => (
        <span key={acc} className="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-raised/60 pl-3 pr-1 text-sm">
          <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: SERIES[i] }} />
          {label(acc)} <span className="num text-[11px] text-muted">{acc}</span>
          <button aria-label={`Remove ${acc}`} className="grid h-7 w-7 place-items-center rounded-md text-muted transition-colors duration-200 hover:bg-line hover:text-fg"
            onClick={() => onChange(selected.filter((s) => s !== acc))}><X className="h-3.5 w-3.5" /></button>
        </span>
      ))}
      {selected.length < 4 && (
        <div className="relative">
          <button className="btn h-9" aria-expanded={open} aria-haspopup="listbox" onClick={() => setOpen((o) => !o)}><Plus className="h-3.5 w-3.5" /> Add investigation</button>
          {open && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
              <div className="pop-enter absolute left-0 z-30 mt-1.5 max-h-80 w-80 origin-top-left overflow-auto rounded-lg border border-line-strong bg-surface p-1 shadow-[0_16px_40px_rgb(0_0_0/0.55)]">
                {data?.filter((d) => !selected.includes(d.accession)).map((d) => (
                  <button key={d.accession} className="flex h-10 w-full items-center justify-between gap-2 rounded-md px-2.5 text-left text-sm transition-colors duration-150 hover:bg-raised"
                    onClick={() => { onChange([...selected, d.accession]); setOpen(false); }}>
                    <span className="truncate">{d.acronym ?? d.title}</span>
                    <span className="num shrink-0 text-[11px] text-muted">{d.n_tests} rows</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function NumericCell({ s, unit }: { s: CompareResult["variables"][number]["per_investigation"][string]; unit: string | null }) {
  if (!s || s.n === 0) return <span className="text-muted/60">not reported</span>;
  const q = Object.entries(s.quality).filter(([k]) => k !== "measured");
  return (
    <div>
      <span className="num text-fg">{s.min === s.max ? fmtNum(s.min) : `${fmtNum(s.min)} – ${fmtNum(s.max)}`}</span>
      {unit && <span className="ml-1 text-[11px] text-muted">{unit}</span>}
      <div className="mt-0.5 text-[11px] text-muted">
        <span className="num">{s.n}/{s.of}</span> rows
        {q.map(([k, v]) => <span key={k} className={cn("ml-1.5", QUALITY_META[k]?.tone)}>· {v} {QUALITY_META[k]?.label ?? k}</span>)}
      </div>
    </div>
  );
}

function CategoricalCell({ s, shared }: { s: CompareResult["variables"][number]["per_investigation"][string]; shared: string[] }) {
  if (!s || s.n === 0) return <span className="text-muted/60">not reported</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {s.top.slice(0, 5).map(([v, n]) => (
        <span key={v} className={cn("rounded border px-1.5 py-0.5 text-[11px]", shared.includes(v) ? "border-ok/40 text-ok" : "border-line text-fg/80")}>
          {v} <span className="num text-muted">{n}</span>
        </span>
      ))}
      {s.top.length > 5 && <span className="text-[11px] text-muted">+{s.top.length - 5}</span>}
    </div>
  );
}

function RangeChart({ data }: { data: CompareResult }) {
  const vars = data.variables.filter((v) => v.kind === "numeric" && ["o2", "pressure", "flow"].includes(v.key));
  const names = data.investigations.map((i) => i.acronym ?? i.accession);
  return (
    <div className="grid gap-2 md:grid-cols-3">
      {vars.map((v) => (
        <div key={v.key}>
          <div className="px-3 pt-3 text-xs font-medium text-fg">{v.label} <span className="font-normal text-muted">({v.unit})</span></div>
          <Plot height={64 + 34 * names.length} label={`${v.label} range per investigation`}
            data={data.investigations.map((inv, i) => {
              const s = v.per_investigation[inv.accession];
              const has = s && s.n > 0;
              return {
                type: "scatter", mode: "lines+markers", name: names[i], showlegend: false,
                x: has ? [s.min, s.max] : [], y: [names[i], names[i]],
                line: { color: SERIES[i], width: 5 },
                marker: { color: SERIES[i], size: 9, symbol: SYMBOLS[i], line: { color: SURFACE, width: 2 } },
                hovertemplate: `<b>${names[i]}</b><br>%{x}<extra></extra>`,
              } as Plotly.Data;
            })}
            layout={{ margin: { l: 8, r: 14, t: 6, b: 30 }, xaxis: { showline: false },
              yaxis: { automargin: true, showgrid: false, categoryorder: "array", categoryarray: [...names].reverse(),
                tickfont: { color: INK.secondary, size: 11, family: "Inter, sans-serif" } } }} />
        </div>
      ))}
    </div>
  );
}

export default function Compare() {
  const [sp, setSp] = useSearchParams();
  const ids = (sp.get("ids") ?? "").split(",").filter(Boolean);
  const setIds = (next: string[]) => setSp(next.length ? { ids: next.join(",") } : {}, { replace: true });
  const { data, isLoading, error } = useQuery({ queryKey: ["compare", ids], queryFn: () => api.compare(ids), enabled: ids.length >= 2 });

  const points = useMemo(() => (data?.points ?? []).filter((p) => p.pressure !== null).map((p) => ({
    group: data!.investigations.find((i) => i.accession === p.accession)?.acronym ?? p.accession,
    o2: p.o2, o2_min: p.o2_min, o2_max: p.o2_max, pressure: p.pressure as number, inverse: p.inverse,
    label: [p.fuel, p.outcome].filter(Boolean).join(" · "),
  })), [data]);
  const groupOrder = data?.investigations.map((i) => i.acronym ?? i.accession) ?? [];
  const missingP = data ? data.investigations.filter((i) => !data.points.some((p) => p.accession === i.accession && p.pressure !== null)) : [];

  return (
    <div className="page-enter">
      <PageHeader eyebrow="Module 2" title="Scientific comparator">
        Compare 2–4 investigations on harmonized variables only. Differences in fuel phase, data type and variable definitions
        are flagged automatically — a comparison is never assumed to be like-for-like.
      </PageHeader>

      <Card className="relative z-30 mb-5 p-4">
        <Picker selected={ids} onChange={setIds} />
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line/70 pt-4 text-xs">
          <span className="text-muted">Presets</span>
          {PRESETS.map((p) => (
            <button key={p.label} onClick={() => setIds(p.ids)} className="chip"
              aria-pressed={p.ids.length === ids.length && p.ids.every((x) => ids.includes(x))}>{p.label}</button>
          ))}
        </div>
      </Card>

      {ids.length < 2 && <Card className="p-8 text-center text-sm text-muted">Select at least two investigations, or start from a preset.</Card>}
      {isLoading && <Loading label="Comparing" />}
      {error && <ErrorState error={error} />}
      {data && ids.length >= 2 && (
        <div className="space-y-5">
          {data.warnings.length > 0 && (
            <div className="grid gap-2 md:grid-cols-2">
              {data.warnings.map((w) => {
                const Icon = WARN_ICON[w.level];
                return (
                  <div key={w.title} className={cn("flex gap-3 rounded-xl border p-4 text-sm", WARN_CLS[w.level])}>
                    <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", WARN_ICON_CLS[w.level])} />
                    <div><div className="font-semibold text-fg">{w.title}</div><div className="mt-1 text-[13px] leading-relaxed text-fg-2">{w.text}</div></div>
                  </div>
                );
              })}
            </div>
          )}

          <Card className="overflow-hidden">
            <CardHeader title="Comparison matrix" subtitle="Hover a status for its definition. Values are ranges over all rows that report the variable." />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="border-b border-line bg-raised/50">
                    <th className="w-48 px-4 py-3 text-xs font-medium text-muted">Variable</th>
                    {data.investigations.map((inv, i) => (
                      <th key={inv.accession} className="px-4 py-3">
                        <Link to={`/experiments/${inv.accession}`} className="flex items-center gap-2 transition-colors duration-200 hover:text-plasma">
                          <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: SERIES[i] }} />
                          <span className="font-semibold">{inv.acronym ?? inv.accession}</span>
                        </Link>
                      </th>
                    ))}
                    <th className="w-36 px-4 py-3 text-xs font-medium text-muted">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.attributes.map((a) => (
                    <tr key={a.label} className="border-b border-line/50 transition-colors duration-150 hover:bg-raised/40">
                      <td className="px-4 py-2.5 text-xs text-muted">{a.label}</td>
                      {data.investigations.map((inv) => <td key={inv.accession} className="px-4 py-2.5 text-[13px] text-fg/90">{a.values[inv.accession] || "—"}</td>)}
                      <td className="px-4 py-2.5">
                        {a.status === "same" ? <Badge className="border-ok/40 text-ok"><Check className="h-3 w-3" /> same</Badge> : <Badge>different</Badge>}
                      </td>
                    </tr>
                  ))}
                  <tr><td colSpan={data.investigations.length + 2} className="bg-raised/30 px-4 py-1.5 label">Harmonized variables</td></tr>
                  {data.variables.map((v) => (
                    <tr key={v.key} className="border-b border-line/50 align-top transition-colors duration-150 hover:bg-raised/40">
                      <td className="px-4 py-3">
                        <div className="text-[13px] font-medium text-fg">{v.label}</div>
                        {v.note && <div className="mt-1 text-[11px] leading-snug text-muted">{v.note}</div>}
                      </td>
                      {data.investigations.map((inv) => (
                        <td key={inv.accession} className="px-4 py-3">
                          {v.kind === "numeric"
                            ? <NumericCell s={v.per_investigation[inv.accession]} unit={v.unit} />
                            : <CategoricalCell s={v.per_investigation[inv.accession]} shared={v.shared_values ?? []} />}
                        </td>
                      ))}
                      <td className="px-4 py-3">
                        <span title={STATUS[v.status].help}><Badge className={STATUS[v.status].cls}>{STATUS[v.status].label}</Badge></span>
                        {v.overlap && (
                          <div className="mt-1.5 text-[11px] text-muted">
                            {v.overlap.overlaps ? <>shared range <span className="num text-fg/80">{fmtNum(v.overlap.min)}–{fmtNum(v.overlap.max)}</span></> : "ranges do not overlap"}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <CardHeader title="Condition envelopes" subtitle="Range of each condition tested (min–max over reporting rows). Empty line = not reported." />
            <div className="px-3 pb-3"><RangeChart data={data} /></div>
          </Card>

          <Card>
            <CardHeader title="Tested atmospheres vs exploration atmospheres"
              subtitle="Every row reporting both O₂ and pressure. Reference atmospheres from the challenge statement; horizontal bars show O₂ ranges or set-point lists." />
            <div className="px-4 pb-4 pt-2">
              {points.length ? <AtmosphereMap points={points} groupOrder={groupOrder} /> :
                <p className="p-6 text-sm text-muted">None of the selected investigations reports both O₂ and pressure per row.</p>}
              {missingP.length > 0 && points.length > 0 && (
                <p className="px-3 text-xs text-muted">Not shown (O₂ and pressure not both reported): {missingP.map((i) => i.acronym ?? i.accession).join(", ")}.</p>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
