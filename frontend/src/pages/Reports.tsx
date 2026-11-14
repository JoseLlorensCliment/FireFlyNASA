import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Download, FileText, Loader2, Printer, Sparkles } from "lucide-react";
import { Badge, Card, CardHeader, ErrorState, PageHeader } from "@/components/ui/primitives";
import { Picker } from "@/pages/Compare";
import { api } from "@/services/api";

interface ReportResponse { title: string; markdown: string; ai: { mode: string } | null; generated_at: string }

async function createReport(body: { question: string; accessions: string[]; include_ai: boolean }): Promise<ReportResponse> {
  const r = await fetch(`${import.meta.env.VITE_API_URL ?? ""}/api/reports`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${r.status} — ${(await r.json().catch(() => ({}))).detail ?? r.statusText}`);
  return r.json();
}

const TEMPLATES = [
  { q: "How effective are inert-gas suppressants against microgravity flames?", ids: ["PSI-69", "PSI-26"] },
  { q: "What evidence exists on material flammability for oxygen-enriched cabins?", ids: ["PSI-159", "PSI-99", "PSI-25"] },
  { q: "How do microgravity smoke properties affect fire detection?", ids: ["PSI-102", "PSI-101"] },
];

export default function Reports() {
  const status = useQuery({ queryKey: ["assistant-status"], queryFn: api.assistantStatus });
  const [question, setQuestion] = useState("");
  const [ids, setIds] = useState<string[]>([]);
  const [ai, setAi] = useState(false);
  const mut = useMutation({ mutationFn: createReport });
  const aiReady = !!status.data?.llm_configured && !!status.data?.index.ready;

  const download = () => {
    if (!mut.data) return;
    const blob = new Blob([mut.data.markdown], { type: "text/markdown;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `flame-intelligence-report-${mut.data.generated_at.slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="page-enter">
      <div className="no-print">
        <PageHeader eyebrow="Module 5" title="Scientific reports">
          Build a report from a research question and 1–4 investigations. Data, comparisons and references come straight from
          the PSI database; the optional AI discussion is drafted only from retrieved NASA sources and keeps its citations.
        </PageHeader>

        <Card className="mb-6">
          <CardHeader title="Report setup" subtitle="Pick a question and the investigations it draws on. Nothing is sent until you generate." />
          <div className="space-y-5 p-5">
            <label className="block">
              <div className="label mb-1.5">Research question</div>
              <input className="input h-11" value={question} maxLength={500} onChange={(e) => setQuestion(e.target.value)}
                placeholder="e.g. How does oxygen concentration affect flame extinction?" aria-label="Research question" />
            </label>
            <div>
              <div className="label mb-1.5">Investigations (1–4)</div>
              <Picker selected={ids} onChange={setIds} />
            </div>
            <div>
              <div className="label mb-1.5">Start from a template</div>
              <div className="flex flex-wrap gap-1.5">
                {TEMPLATES.map((t) => (
                  <button key={t.q} onClick={() => { setQuestion(t.q); setIds(t.ids); }} aria-pressed={question === t.q}
                    className="chip h-auto py-1.5 text-left">{t.q}</button>
                ))}
              </div>
            </div>
            <label className="card-inset flex cursor-pointer items-start gap-3 p-3.5 text-sm">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#ff7a1a]" checked={ai} onChange={(e) => setAi(e.target.checked)} />
              <span>
                Include AI-assisted discussion <span className="text-muted">(one Groq call with RAG citations)</span>
                {!aiReady && <span className="mt-1 block text-xs leading-relaxed text-warn">
                  Not available yet: {status.data?.index.ready ? "" : "RAG index not built (see RAG_HANDOFF.md)"}
                  {status.data && !status.data.llm_configured ? " · LLM API key not set" : ""}. The report will note it and still be generated.
                </span>}
              </span>
            </label>
            <button className="btn btn-primary h-10 px-4" disabled={question.trim().length < 3 || ids.length === 0 || mut.isPending}
              onClick={() => mut.mutate({ question: question.trim(), accessions: ids, include_ai: ai })}>
              {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : ai ? <Sparkles className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
              Generate report
            </button>
          </div>
        </Card>
        {mut.error && <ErrorState error={mut.error} />}
      </div>

      {mut.data && (
        <Card className="print-area">
          <div className="no-print flex flex-wrap items-center justify-between gap-2 border-b border-line/70 px-5 py-3">
            <div className="flex items-center gap-2 text-xs">
              <Badge>generated {mut.data.generated_at.replace("T", " ").replace("+00:00", " UTC")}</Badge>
              {mut.data.ai && <Badge className={mut.data.ai.mode === "generated" ? "border-ok/40 text-ok" : "border-warn/40 text-warn"}>AI: {mut.data.ai.mode}</Badge>}
            </div>
            <div className="flex gap-2">
              <button className="btn h-8" onClick={download}><Download className="h-3.5 w-3.5" /> Markdown</button>
              <button className="btn h-8" onClick={() => window.print()}><Printer className="h-3.5 w-3.5" /> Print / PDF</button>
            </div>
          </div>
          <article className="report px-6 py-7 md:px-12 md:py-10">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
              a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer" className="link">{children}</a>,
            }}>{mut.data.markdown}</ReactMarkdown>
          </article>
        </Card>
      )}
    </div>
  );
}
