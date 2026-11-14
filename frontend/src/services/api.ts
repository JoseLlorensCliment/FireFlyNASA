import type { AskResponse, AssistantStatus, CompareResult, InvestigationDetail, InvestigationSummary, Scenario, Stats, TestPage } from "@/types/api";

const BASE = import.meta.env.VITE_API_URL ?? "";

async function get<T>(path: string, params?: Record<string, string | number | boolean | undefined | null>): Promise<T> {
  const url = new URL(`${BASE}${path}`, window.location.origin);
  Object.entries(params ?? {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${path}`);
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) {
    let detail = res.statusText;
    try { detail = (await res.json()).detail ?? detail; } catch { /* not JSON */ }
    throw new Error(`${res.status} — ${detail}`);
  }
  return res.json() as Promise<T>;
}

export interface InvestigationFilters {
  q?: string;
  fuel_phase?: string;
  role?: string;
  project_type?: string;
  has_tests?: boolean;
  sort?: string;
}

export const api = {
  stats: () => get<Stats>("/api/stats"),
  investigations: (f: InvestigationFilters) => get<InvestigationSummary[]>("/api/investigations", { ...f }),
  investigation: (acc: string) => get<InvestigationDetail>(`/api/investigations/${acc}`),
  tests: (acc: string, table?: string, limit = 100, offset = 0) =>
    get<TestPage>(`/api/investigations/${acc}/tests`, { table, limit, offset }),
  compare: (ids: string[]) => get<CompareResult>("/api/compare", { ids: ids.join(",") }),
  scenarios: () => get<Scenario[]>("/api/scenarios"),
  assistantStatus: () => get<AssistantStatus>("/api/assistant/status"),
  ask: (question: string, accessions?: string[]) => post<AskResponse>("/api/assistant/ask", { question, accessions }),
  documentUrl: (chunkId: number, page?: number | null) => `${BASE}/api/documents/${chunkId}${page ? `#page=${page}` : ""}`,
};
