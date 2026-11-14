import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import { AlertTriangle, BookOpen, Bot, CheckCircle2, ExternalLink, FileText, Lightbulb, Loader2, Send, Table2, X } from "lucide-react";
import { api } from "@/services/api";
import { Badge, Card, PageHeader } from "@/components/ui/primitives";
import type { AskResponse, Claim, Source } from "@/types/api";
import { cn } from "@/lib/utils";

const EXAMPLES = [
  "What conditions favor flame propagation in microgravity?",
  "How does oxygen concentration affect combustion and extinction?",
  "Compare the findings of FLEX and BASS on fire suppression.",
  "Which materials showed the most concerning combustion behavior in Saffire?",
  "What are the main implications for spacecraft fire safety?",
];

const TYPE_META: Record<Source["source_type"], { label: string; icon: typeof FileText }> = {
  psi_record: { label: "PSI record", icon: BookOpen },
  psi_table: { label: "PSI data table", icon: Table2 },
  psi_document: { label: "PSI document", icon: FileText },
  nasa_doc: { label: "NASA document", icon: FileText },
};

interface Turn { id: number; question: string; scope: string[]; result?: AskResponse; error?: string }

function withCitationLinks(md: string) {
  return md.replace(/\[S(\d+)\]/g, "[S$1](#cite-S$1)");
}

function CiteChip({ id, onClick }: { id: string; onClick: (id: string) => void }) {
  return (
    <button onClick={() => onClick(id)}
      aria-label={`Show source ${id}`}
      className="num mx-0.5 inline-flex -translate-y-px items-center rounded-[5px] border border-plasma/35 bg-plasma/[0.08] px-1 text-[10px] font-medium leading-4 text-plasma transition-colors duration-150 hover:border-plasma/70 hover:bg-plasma/15 active:scale-95">
      {id}
    </button>
  );
}

function Claims({ title, items, tone, onCite }: { title: string; items: Claim[]; tone: string; onCite: (id: string) => void }) {
  if (!items.length) return null;
  return (
    <div>
      <div className="label mb-2.5 flex items-center gap-2"><span className={cn("h-1.5 w-1.5 rounded-full", tone.replace("text-", "bg-"))} />{title}</div>
      <ul className="space-y-2 text-[13px] leading-relaxed text-fg-2">
        {items.map((c, i) => (
          <li key={i} className="flex gap-2.5"><span className={cn("mt-[9px] h-px w-2.5 shrink-0", tone.replace("text-", "bg-"))} />
            <span>{c.statement} {c.sources.map((s) => <CiteChip key={s} id={s} onClick={onCite} />)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SourceCard({ s, active }: { s: Source; active: boolean }) {
  const meta = TYPE_META[s.source_type];
  const Icon = meta.icon;
  return (
    <div id={`src-${s.chunk_id}`} className={cn("scroll-mt-4 rounded-lg border p-3.5 transition-colors duration-200", active ? "border-plasma/60 bg-plasma/[0.06]" : "border-line bg-raised/30")}>
      <div className="flex items-start gap-2">
        <span className={cn("num shrink-0 rounded-[5px] border px-1.5 py-0.5 text-[10px] font-medium", s.cited ? "border-plasma/40 bg-plasma/10 text-plasma" : "border-line bg-bg/40 text-muted")}>{s.id}</span>
        <div className="min-w-0">
          <div className="text-[13px] font-medium leading-snug text-fg">{s.title}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted">
            <span className="inline-flex items-center gap-1"><Icon className="h-3 w-3" />{meta.label}</span>
            {s.page && <span>page {s.page}</span>}
            {s.accession && <Link to={`/experiments/${s.accession}`} className="num transition-colors hover:text-fg">{s.accession}</Link>}
            <span className="num">sim {s.score.toFixed(2)}</span>
          </div>
        </div>
      </div>
      <p className="mt-2 line-clamp-4 text-xs leading-relaxed text-muted">{s.snippet}</p>
      <div className="mt-2 flex flex-wrap gap-3 text-[11px]">
        {s.has_local_file && <a className="link inline-flex items-center gap-1" href={api.documentUrl(s.chunk_id, s.page)} target="_blank" rel="noreferrer">Open PDF{s.page ? ` at p. ${s.page}` : ""} <ExternalLink className="h-3 w-3" /></a>}
        {s.url && <a className="link inline-flex items-center gap-1" href={s.url} target="_blank" rel="noreferrer">{s.url.includes("psi.nasa.gov") ? "PSI landing page" : "NASA source"} <ExternalLink className="h-3 w-3" /></a>}
      </div>
    </div>
  );
}

function Answer({ r, onAsk }: { r: AskResponse; onAsk: (q: string) => void }) {
  const [active, setActive] = useState<string | null>(null);
  const cite = (id: string) => {
    setActive(id);
    const s = r.sources.find((x) => x.id === id);
    if (s) document.getElementById(`src-${s.chunk_id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-4">
        {r.mode === "retrieval_only" && (
          <div className="flex gap-2.5 rounded-lg border border-warn/30 bg-warn/[0.06] px-4 py-3 text-[13px] leading-relaxed text-fg-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
            <div><b className="font-semibold text-fg">Retrieval-only mode.</b> No answer was generated ({r.warnings[0]}). The most relevant NASA passages are listed as sources.</div>
          </div>
        )}
        {r.answer && (
          <div className="max-w-[72ch] text-[15px] leading-[1.7] text-fg/95 [&_li]:mb-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-3 [&_strong]:text-fg [&_ul]:list-disc [&_ul]:pl-5">
            <ReactMarkdown components={{
              a: ({ href, children }) => href?.startsWith("#cite-")
                ? <CiteChip id={href.slice(6)} onClick={cite} />
                : <a href={href} target="_blank" rel="noreferrer" className="link">{children}</a>,
            }}>{withCitationLinks(r.answer)}</ReactMarkdown>
          </div>
        )}
        {r.mode === "generated" && (
          <div className="flex flex-wrap items-center gap-2">
            {r.sufficient === false
              ? <Badge className="border-warn/40 text-warn"><AlertTriangle className="h-3 w-3" /> insufficient evidence in sources</Badge>
              : <Badge className="border-ok/40 text-ok"><CheckCircle2 className="h-3 w-3" /> grounded in {r.sources.filter((s) => s.cited).length} cited sources</Badge>}
            <Badge>{r.model}</Badge>
            {r.cached && <Badge>cached</Badge>}
          </div>
        )}
        {r.warnings.length > 0 && r.mode === "generated" && (
          <ul className="text-xs text-warn">{r.warnings.map((w) => <li key={w}>⚠ {w}</li>)}</ul>
        )}
        {(r.evidence.length > 0 || r.interpretation.length > 0 || r.limitations.length > 0) && (
          <Card className="space-y-5 p-5">
            <Claims title="Evidence — stated in the sources" items={r.evidence} tone="text-ok" onCite={cite} />
            <Claims title="Interpretation — reasoning across sources" items={r.interpretation} tone="text-warn" onCite={cite} />
            {r.limitations.length > 0 && (
              <div>
                <div className="label mb-2.5 flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-ember" />Limitations</div>
                <ul className="space-y-2 text-[13px] leading-relaxed text-fg-2">{r.limitations.map((l) => <li key={l} className="flex gap-2.5"><span className="mt-[9px] h-px w-2.5 shrink-0 bg-ember" />{l}</li>)}</ul>
              </div>
            )}
          </Card>
        )}
        {r.follow_up.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {r.follow_up.map((q) => (
              <button key={q} onClick={() => onAsk(q)} className="chip h-auto gap-1.5 py-1.5 text-left">
                <Lightbulb className="h-3 w-3 shrink-0 text-warn" /> {q}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="space-y-2 xl:sticky xl:top-4 xl:max-h-[calc(100vh-11rem)] xl:self-start xl:overflow-auto xl:pr-1">
        <div className="label">Sources <span className="num text-fg-2">{r.sources.length}</span></div>
        {r.sources.map((s) => <SourceCard key={s.id} s={s} active={active === s.id} />)}
      </div>
    </div>
  );
}

export default function Assistant() {
  const status = useQuery({ queryKey: ["assistant-status"], queryFn: api.assistantStatus });
  const invs = useQuery({ queryKey: ["investigations", {}], queryFn: () => api.investigations({ sort: "name" }) });
  const [q, setQ] = useState("");
  const [scope, setScope] = useState<string[]>([]);
  const [turns, setTurns] = useState<Turn[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

  const mut = useMutation({
    mutationFn: (t: Turn) => api.ask(t.question, t.scope.length ? t.scope : undefined),
    onSuccess: (result, t) => setTurns((ts) => ts.map((x) => (x.id === t.id ? { ...x, result } : x))),
    onError: (err, t) => setTurns((ts) => ts.map((x) => (x.id === t.id ? { ...x, error: String((err as Error).message) } : x))),
  });

  const ask = (question: string) => {
    const text = question.trim();
    if (text.length < 3 || mut.isPending) return;
    const t: Turn = { id: Date.now(), question: text, scope };
    setTurns((ts) => [...ts, t]);
    setQ("");
    mut.mutate(t);
  };

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [turns.length]);

  const st = status.data;
  return (
    <div className="page-enter">
      <PageHeader eyebrow="Module 3" title="AI research assistant">
        Answers are generated only from retrieved NASA sources — PSI records, experimental-table summaries, PSI documents and
        NASA fact sheets — with numbered citations. Evidence and interpretation are kept separate.
      </PageHeader>

      <div className="mb-5 flex min-h-6 flex-wrap items-center gap-2 text-xs">
        {st && (
          <>
            <Badge className={st.index.ready ? "border-ok/40 text-ok" : "border-ember/40 text-ember"}>
              {st.index.ready ? `Index: ${st.index.n_chunks?.toLocaleString("en-US")} passages · ${st.index.n_documents} sources` : "Index not built"}
            </Badge>
            <Badge className={st.llm_configured ? "border-ok/40 text-ok" : "border-warn/40 text-warn"}>
              {st.llm_configured ? `LLM: ${st.llm_model} (${st.llm_provider})` : `LLM not configured (${st.llm_provider}) — retrieval only`}
            </Badge>
            <Badge>Embeddings: {st.embedding_model}</Badge>
          </>
        )}
      </div>

      {turns.length === 0 && (
        <Card className="mb-6 p-5 md:p-6">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg border border-plasma/30 bg-plasma/10"><Bot className="h-4 w-4 text-plasma" /></span>
            <div>
              <div className="text-[15px] font-semibold tracking-[-0.01em] text-fg">Try a research question</div>
              <div className="text-xs text-muted">Each one retrieves NASA passages first, then drafts a cited answer.</div>
            </div>
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-2">
            {EXAMPLES.map((e) => (
              <button key={e} onClick={() => ask(e)} className="lift group flex min-h-11 items-center justify-between gap-3 rounded-lg border border-line bg-raised/30 px-3.5 py-2.5 text-left text-sm text-fg-2 transition-colors hover:text-fg active:scale-[0.99]">
                <span>{e}</span><Send className="h-3.5 w-3.5 shrink-0 text-muted transition-colors group-hover:text-flame" />
              </button>
            ))}
          </div>
        </Card>
      )}

      <div className="space-y-8 pb-40">
        {turns.map((t) => (
          <section key={t.id} className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md border border-flame/30 bg-flame/10 text-[10px] font-semibold text-flame">Q</div>
              <div>
                <div className="text-[17px] font-semibold leading-snug tracking-[-0.012em] text-fg">{t.question}</div>
                {t.scope.length > 0 && <div className="mt-1 text-[11px] text-muted">Scope: {t.scope.join(", ")}</div>}
              </div>
            </div>
            {!t.result && !t.error && (
              <div className="flex items-center gap-2 pl-9 text-sm text-muted"><Loader2 className="h-4 w-4 animate-spin" /> Retrieving NASA sources and drafting a cited answer…</div>
            )}
            {t.error && <div className="ml-9 flex gap-2 rounded-lg border border-ember/40 bg-ember/[0.06] px-4 py-3 text-sm text-fg-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-ember" />{t.error}</div>}
            {t.result && <div className="pl-0 md:pl-9"><Answer r={t.result} onAsk={ask} /></div>}
          </section>
        ))}
        <div ref={endRef} />
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-bg/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:left-60">
        <div className="mx-auto max-w-[1360px] px-4 py-3 md:px-8">
          <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-muted">Scope:</span>
            {scope.length === 0 && <span className="text-muted/80">all investigations</span>}
            {scope.map((a) => (
              <span key={a} className="inline-flex h-7 items-center gap-1 rounded-full border border-line bg-raised pl-2.5 pr-0.5 text-fg-2">
                {invs.data?.find((i) => i.accession === a)?.acronym ?? a}
                <button className="grid h-6 w-6 place-items-center rounded-full text-muted transition-colors hover:bg-line hover:text-fg" aria-label={`Remove ${a}`} onClick={() => setScope((s) => s.filter((x) => x !== a))}><X className="h-3 w-3" /></button>
              </span>
            ))}
            <select className="input h-7 w-auto rounded-full py-0 text-xs" value="" aria-label="Limit to an investigation"
              onChange={(e) => e.target.value && setScope((s) => [...new Set([...s, e.target.value])])}>
              <option value="">+ limit to investigation…</option>
              {invs.data?.map((i) => <option key={i.accession} value={i.accession}>{i.acronym ?? i.title.slice(0, 40)} ({i.accession})</option>)}
            </select>
          </div>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
            <input className="input h-11 text-[15px]" placeholder="Ask about microgravity combustion, materials, oxygen, suppression…" value={q}
              onChange={(e) => setQ(e.target.value)} aria-label="Question" maxLength={1000} />
            <button className="btn btn-primary h-11 px-4" type="submit" disabled={mut.isPending || q.trim().length < 3}>
              {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Ask
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
