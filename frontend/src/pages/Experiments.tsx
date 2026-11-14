import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Database, FileText, Search, SlidersHorizontal, X } from "lucide-react";
import { api } from "@/services/api";
import { Badge, ErrorState, Loading, PageHeader, RoleBadge } from "@/components/ui/primitives";
import { PHASE_COLOR, PHASE_LABEL, ROLE_META, year } from "@/lib/utils";

const SORTS = [
  { v: "relevance", l: "Relevance / default" },
  { v: "tests", l: "Most test rows" },
  { v: "publications", l: "Most publications" },
  { v: "date", l: "Most recent start" },
];

export default function Experiments() {
  const [sp, setSp] = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const filters = {
    q: sp.get("q") ?? undefined,
    fuel_phase: sp.get("phase") ?? undefined,
    role: sp.get("role") ?? undefined,
    project_type: sp.get("type") ?? undefined,
    has_tests: sp.get("tests") === "1" ? true : undefined,
    sort: sp.get("sort") ?? "relevance",
  };
  const { data, isLoading, error } = useQuery({ queryKey: ["investigations", filters], queryFn: () => api.investigations(filters) });

  useEffect(() => setQ(sp.get("q") ?? ""), [sp]);

  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(sp);
    if (value) next.set(key, value); else next.delete(key);
    setSp(next, { replace: true });
  };
  const active = ["q", "phase", "role", "type", "tests"].some((k) => sp.get(k));

  return (
    <div className="page-enter">
      <PageHeader eyebrow="Module 1" title="Experiment explorer">
        Every combustion-science investigation in NASA's PSI repository. Each record links back
        to its PSI landing page, DOI and publications.
      </PageHeader>

      <div className="card mb-5 p-3">
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <form className="relative flex-1" onSubmit={(e) => { e.preventDefault(); set("q", q.trim() || null); }}>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input className="input pl-10" placeholder="Search title, objectives, keywords, fuels… (Enter)" value={q}
              onChange={(e) => setQ(e.target.value)} aria-label="Search" />
          </form>
          <div className="grid grid-cols-2 gap-2 md:flex">
            <select className="input md:w-40" value={sp.get("phase") ?? ""} onChange={(e) => set("phase", e.target.value || null)} aria-label="Fuel phase">
              <option value="">All fuel phases</option>
              {Object.entries(PHASE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select className="input md:w-40" value={sp.get("role") ?? ""} onChange={(e) => set("role", e.target.value || null)} aria-label="Fire-safety role">
              <option value="">All safety roles</option>
              {Object.entries(ROLE_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select className="input md:w-44" value={sp.get("type") ?? ""} onChange={(e) => set("type", e.target.value || null)} aria-label="Project type">
              <option value="">Flight & ground</option>
              <option value="Microgravity Investigation">Microgravity (flight)</option>
              <option value="Ground Investigation">Ground re-analysis</option>
            </select>
            <select className="input md:w-44" value={sp.get("sort") ?? "relevance"} onChange={(e) => set("sort", e.target.value)} aria-label="Sort">
              {SORTS.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}
            </select>
          </div>
        </div>
        <div className="mt-2 flex min-h-[32px] flex-wrap items-center gap-2 px-1 text-xs">
          <label className="flex cursor-pointer items-center gap-2 text-fg-2">
            <input type="checkbox" className="h-4 w-4 rounded accent-[#ff7a1a]" checked={sp.get("tests") === "1"}
              onChange={(e) => set("tests", e.target.checked ? "1" : null)} />
            Only with tabulated test data
          </label>
          {active && (
            <button className="btn ml-auto h-8 px-2.5 text-xs" onClick={() => { setSp({}); setQ(""); }}>
              <X className="h-3 w-3" /> Clear filters
            </button>
          )}
        </div>
      </div>

      {isLoading && <Loading label="Searching" />}
      {error && <ErrorState error={error} />}
      {data && (
        <>
          <div className="mb-3 flex items-center gap-2 text-xs text-muted" aria-live="polite">
            <SlidersHorizontal className="h-3.5 w-3.5" /> <span className="num text-fg-2">{data.length}</span> investigation{data.length === 1 ? "" : "s"}
          </div>
          {data.length === 0 && (
            <div className="card p-8 text-center text-sm text-muted">No investigation matches these filters.</div>
          )}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.map((inv) => (
              <Link key={inv.accession} to={`/experiments/${inv.accession}`}
                className="card lift group flex flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-base font-semibold tracking-[-0.01em] text-fg transition-colors duration-200 group-hover:text-plasma">{inv.acronym ?? "Ground study"}</span>
                      <span className="num text-[11px] text-muted">{inv.accession}</span>
                    </div>
                    <div className="mt-1 line-clamp-2 text-sm leading-snug text-fg-2">{inv.title}</div>
                  </div>
                  <Badge className={inv.project_type?.startsWith("Micro") ? "border-plasma/40 text-plasma" : ""}>
                    {inv.project_type?.startsWith("Micro") ? "µg flight" : "ground"}
                  </Badge>
                </div>
                <p className="mt-3 line-clamp-3 text-xs leading-relaxed text-muted">{inv.objectives_excerpt}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {inv.fuel_phase && (
                    <Badge><span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: PHASE_COLOR[inv.fuel_phase] }} />{PHASE_LABEL[inv.fuel_phase]}</Badge>
                  )}
                  {inv.roles.map((r) => <RoleBadge key={r} role={r} />)}
                </div>
                <div className="mt-auto flex items-center gap-4 border-t border-line/60 pt-3 text-xs text-muted" style={{ marginTop: "1rem" }}>
                  <span className="flex items-center gap-1"><Database className="h-3.5 w-3.5" /> <span className="num">{inv.n_tests}</span> rows</span>
                  <span className="flex items-center gap-1"><FileText className="h-3.5 w-3.5" /> <span className="num">{inv.n_publications}</span> pubs</span>
                  <span className="num ml-auto">{year(inv.start_date)}–{inv.end_date ? year(inv.end_date) : "…"}</span>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
