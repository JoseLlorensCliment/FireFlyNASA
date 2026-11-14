export interface FacetCount { key: string; count: number }

export interface InvestigationSummary {
  accession: string;
  acronym: string | null;
  title: string;
  project_type: string | null;
  flight_platform: string | null;
  sub_research_area: string | null;
  start_date: string | null;
  end_date: string | null;
  fuel_phase: string | null;
  roles: string[];
  tags: string[];
  hardware_family: string | null;
  n_tests: number;
  n_publications: number;
  objectives_excerpt: string | null;
  score: number | null;
}

export interface ColumnSummary {
  column: string;
  status: "constant" | "varies" | "empty";
  distinct: number;
  numeric_min: number | null;
  numeric_max: number | null;
  example_values: string[];
}

export interface TableInfo {
  table: string;
  kind: string;
  n_rows: number;
  encoding: string;
  source_file: string;
  columns: string[];
  notes: string[];
  curator_note: string | null;
  column_summary: ColumnSummary[];
}

export interface Publication { title: string; authors: string | null; doi: string | null }

export interface InvestigationDetail extends InvestigationSummary {
  doi: string | null;
  license: string | null;
  hardware: string | null;
  hardware_link: string | null;
  nasa_center: string | null;
  sponsor: string | null;
  objectives: string | null;
  approach: string | null;
  hypothesis: string | null;
  research_impacts: string | null;
  keywords: string[];
  related: { accession: string; acronym: string | null; title: string }[];
  contacts: { name: string; affiliation: string | null }[];
  psi_url: string;
  record_source: string;
  curation_basis: string | null;
  total_file_size: number | null;
  release_date: string | null;
  publications: Publication[];
  tables: TableInfo[];
  file_categories: { category: string; n: number; bytes: number }[];
}

export interface Quantity { value: number | null; min: number | null; max: number | null; quality: string; raw: string }

export interface TestRow {
  id: number;
  accession: string;
  table: string;
  row_index: number;
  kind: string;
  fuel: string | null;
  fuel_raw: string | null;
  o2: number | null;
  o2_quality: string | null;
  pressure: number | null;
  pressure_quality: string | null;
  flow: number | null;
  flow_quality: string | null;
  flow_direction: string | null;
  burn_time: number | null;
  outcome: string | null;
  raw: Record<string, string>;
  harmonized: Record<string, Quantity | string | null>;
  provenance: Record<string, string>;
}

export interface TestPage { total: number; items: TestRow[] }

export interface Stats {
  n_investigations: number;
  n_microgravity: number;
  n_ground: number;
  n_with_tables: number;
  n_test_rows: number;
  n_publications: number;
  n_dois: number;
  n_harmonized_variables: number;
  harmonized_counts: Record<string, number>;
  by_fuel_phase: FacetCount[];
  by_role: FacetCount[];
  by_platform: FacetCount[];
  by_hardware: FacetCount[];
  timeline: { accession: string; label: string; start: string; end: string | null; project_type: string; fuel_phase: string }[];
  source: string;
  built_at: string;
}

export interface NumericStats { n: number; of: number; min: number | null; max: number | null; median: number | null; quality: Record<string, number> }
export interface CategoricalStats { n: number; of: number; top: [string, number][] }

export interface CompareVariable {
  key: string;
  label: string;
  unit: string | null;
  kind: "numeric" | "categorical";
  status: "comparable" | "caution" | "partial" | "not_reported" | "not_comparable" | "different";
  per_investigation: Record<string, NumericStats & CategoricalStats>;
  overlap?: { overlaps: boolean; min: number | null; max: number | null } | null;
  shared_values?: string[];
  note: string | null;
}

export interface CompareResult {
  investigations: (Pick<InvestigationSummary, "accession" | "acronym" | "title" | "project_type" | "flight_platform" | "fuel_phase" | "roles" | "hardware_family" | "n_tests"> & { row_kinds: Record<string, number>; tables: string[] })[];
  attributes: { label: string; values: Record<string, string>; status: "same" | "different" }[];
  variables: CompareVariable[];
  warnings: { level: "critical" | "warning" | "info"; title: string; text: string }[];
  points: { accession: string; o2: number; o2_min: number | null; o2_max: number | null; pressure: number | null; flow: number | null; quality: string; inverse: boolean; fuel: string | null; outcome: string | null }[];
}

export interface Scenario { id: string; label: string; o2_pct?: number; pressure_kpa?: number; o2_pct_min?: number; pressure_kpa_max?: number; basis: string }

export interface Source {
  id: string; title: string; accession: string | null; page: number | null; url: string | null;
  source_type: "psi_record" | "psi_table" | "psi_document" | "nasa_doc"; doc_id: string;
  has_local_file: boolean; chunk_id: number; snippet: string; score: number; cited?: boolean;
}
export interface Claim { statement: string; sources: string[] }
export interface AskResponse {
  question: string;
  mode: "generated" | "retrieval_only" | "no_sources";
  model?: string;
  answer: string | null;
  evidence: Claim[];
  interpretation: Claim[];
  limitations: string[];
  sufficient: boolean | null;
  follow_up: string[];
  warnings: string[];
  sources: Source[];
  focus: string[];
  cached?: boolean;
}
export interface AssistantStatus {
  llm_provider: string; llm_model: string; llm_configured: boolean; embedding_model: string;
  index: { ready: boolean; n_chunks?: number; n_documents?: number; error?: string };
}
