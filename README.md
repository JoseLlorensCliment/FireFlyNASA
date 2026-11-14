# Flame Intelligence

**Explore, compare and interrogate NASA's microgravity combustion research for spacecraft fire safety.**
NASA Space Apps Challenge 2026 — *Flame in Freefall: SI-Powered Fire Safety Insights from Microgravity Combustion Data*.

Flame Intelligence turns the combustion-science archive of NASA's **Physical Sciences Informatics (PSI)** repository into a
searchable research workspace. Every number shown in the app is traceable to the original PSI table cell, its unit and its
quality, so researchers can compare experiments without silently mixing incompatible data.

> Independent project. Not endorsed by NASA. No NASA logos or branding are used.

---

## Status

| Module | Status |
|---|---|
| Data pipeline (PSI → normalized SQLite) | ✅ Done: 24 investigations, 22 experimental tables, ~2,000 rows, 352 publications |
| Dashboard | ✅ Done: real statistics only |
| Experiment explorer (search, filters, sort, detail page) | ✅ Done |
| Scientific comparator (rigor warnings, matrix, envelopes, atmosphere map) | ✅ Done |
| AI assistant (RAG with verifiable citations) | ✅ Code done · ⏳ **index not built yet** — to be built on another machine (Google embeddings API), see [RAG_HANDOFF.md](RAG_HANDOFF.md) |
| Safety insights: atmosphere coverage map, FLEX suppression, Saffire-II µg vs 1 g, BASS-II products, transparent relevance ranking (no risk scores) | ✅ Done |
| Reports: question + investigations → Markdown/PDF with data, comparison, limitations, references (+ optional cited AI discussion) | ✅ Done |

## Quick start

Requirements: **Python 3.11+**, **Node.js 20+**, `make` (optional).

```bash
git clone <repo> flame-intelligence && cd flame-intelligence
cp .env.example .env            # add GROQ_API_KEY (answers) and GEMINI_API_KEY (search embeddings)
make setup                      # venv + Python deps + npm install
make build-data                 # builds data/processed/flame.db from the snapshot in data/raw
make data-docs                  # optional: ~70 PSI PDFs (~175 MB) for the AI assistant
make rag                        # builds the RAG index with Google embeddings (see RAG_HANDOFF.md)
```

Run in two terminals:

```bash
make api                        # FastAPI on http://localhost:8000  (docs: /docs)
make web                        # React app on http://localhost:5173
```

Without `make`:

```bash
python3 -m venv .venv && .venv/bin/pip install -r backend/requirements.txt
.venv/bin/python pipeline/build_dataset.py
cd backend && ../.venv/bin/uvicorn app.main:app --reload --port 8000
cd frontend && npm install && npm run dev
```

The repository ships a **snapshot of the PSI data** (`data/raw/psi`), so the app runs offline. To refresh it from NASA
(slow server: up to several minutes per record), run `make data`. Use `make data-docs` to also download about 70 PDF
documents (~175 MB) for the AI assistant.

Tests: `make test` (parsers and API) · `make check` (also the TypeScript type-check).

## Architecture

```
pipeline/                 Offline ETL (never called by the running app)
  fetch_psi.py            PSI JSON API → data/raw (metadata, experimental tables, PDFs)
  parsing.py              Robust cell parsing: units, ranges, "~" approximations, encodings
  build_dataset.py        Per-investigation table specs → data/processed/flame.db
  build_rag_index.py      NASA corpus → chunks → embeddings → data/processed/rag/index.faiss
data/
  raw/psi/                Original NASA files (CC0-1.0), unmodified
  metadata/curation.json  Hand-curated classification (fuel phase, safety role) with its basis
  processed/flame.db      SQLite database used by the API
backend/app/              FastAPI
  core/config.py          Settings from .env (pydantic-settings)
  models/database.py      Read-only SQLite access
  schemas/                Pydantic response models
  services/               Catalogue, test tables, statistics
  api/                    HTTP routes (/api/...)
  ai/                     RAG: embeddings.py (local fastembed), retriever.py (FAISS),
                          llm.py (Groq adapter), assistant.py (prompting, citation checks)
frontend/src/             React + TypeScript + Vite + Tailwind + Plotly
  pages/ components/ services/ hooks/ types/
```

### API (selection)

| Endpoint | Description |
|---|---|
| `GET /api/stats` | Dashboard statistics computed from the database |
| `GET /api/investigations?q=&fuel_phase=&role=&project_type=&has_tests=&sort=` | Search and filter |
| `GET /api/investigations/{PSI-n}` | Full record: objectives, hardware, publications, table metadata, column summaries |
| `GET /api/investigations/{PSI-n}/tests?table=&limit=&offset=` | Test rows: original cells plus harmonized values with provenance |
| `GET /api/compare?ids=PSI-69,PSI-25` | Comparison: attributes, harmonized variables with comparability status, warnings, points |
| `POST /api/assistant/ask` `{question, accessions?}` | RAG answer with [S#] citations, evidence vs interpretation, limitations |
| `GET /api/assistant/status` | LLM / index readiness |
| `GET /api/insights/{atmospheres,flex-suppression,saffire-gravity,bass2-products,relevance}` | Descriptive safety analyses, each with `method` and `limitations` |
| `POST /api/reports` `{question, accessions[1-4], include_ai}` | Structured report + Markdown |
| `GET /api/documents/{chunk_id}` | Local copy of a cited NASA PDF (open at `#page=N`) |
| `GET /api/variables`, `GET /api/scenarios` | Harmonized variable dictionary; exploration-atmosphere scenarios |

Interactive docs: http://localhost:8000/docs

## NASA data used

| Source | What we use | License |
|---|---|---|
| [PSI Data Repository – Combustion Science](https://psi.nasa.gov/physci/repo/search?q=combustion) | Metadata for 24 investigations, 22 experimental tables (CSV), 352 publications, ~70 PDF documents | CC0-1.0 |
| [NASA GRC Combustion Science](https://www.nasa.gov/glenn/glenn-expertise-space-exploration/physical-sciences-program/combustion-science/) | 8 experiment fact sheets (ACME, BASS, DAFT, FLEX, SAME, SPICE, Saffire, SLICE) | NASA public |
| [A Researcher's Guide to ISS Combustion Science (2015)](https://www.nasa.gov/missions/station/a-researchers-guide-to-combustion-science/) | Background and lessons learned | NASA public |

Each investigation page links to its PSI landing page and dataset DOI.

## How the data is processed (scientific rigor)

1. **No live dependency on PSI.** A snapshot is fetched once and versioned.
2. **Raw is never altered.** Every row keeps its original cells, shown under *Original* in the UI.
3. **Harmonization is explicit.** Nine canonical variables (fuel, O₂ %, pressure in kPa, flow in cm/s, flow direction,
   CO₂ %, He %, burn time in s, outcome). Each is mapped per table in `pipeline/build_dataset.py` and stores:
   value, min/max, **quality** (`measured`, `approx`, `range`, `set`, `suspect`, `not_reported`), the raw cell and
   the source column.
4. **Nothing is silently fixed.** For example, `3400%` (a spreadsheet artefact) is flagged `suspect` and not used. Fuel
   bottles auto-filled as `CH5`, `CH6`… are kept as raw text, and the fuel family is taken from the "Test Type" column,
   with a visible note.
5. **The structure of each table is declared.** A row may be a single test, a test-day summary or a condition matrix,
   and the UI states which. Comparisons will only use like-for-like rows.
6. **Classification is curated and cited.** Fuel phase and fire-safety role (prevention, detection, suppression,
   fundamental, modeling) live in `data/metadata/curation.json`, each with its basis (challenge statement, PSI record or
   NASA fact sheet).

## How the AI assistant works

1. **Corpus (NASA only).** PSI investigation records, a deterministic factual summary of every experimental table
   generated from `flame.db` (ranges, units, row counts, data notes), verbatim rows of small tables, ~60 PSI documents
   (final reports, science requirement documents, presentations), and NASA GRC fact sheets plus the ISS Researcher's Guide.
2. **Chunking.** Page-aware chunks of ~1,400 characters with overlap (PyMuPDF); each keeps its title, investigation,
   page and URL.
3. **Embeddings.** Google `gemini-embedding-001` (768 dimensions, L2-normalized) by default. A local CPU option is available
   (`EMBEDDING_PROVIDER=local`, `BAAI/bge-small-en-v1.5`).
4. **Retrieval.** FAISS cosine search with at most 3 chunks per document. When the question names investigations
   (e.g. "FLEX vs BASS"), each of them is guaranteed to be represented. An optional scope limits the search to chosen
   investigations.
5. **Generation.** Groq `openai/gpt-oss-120b` (free plan, low reasoning effort, JSON output; Gemini optional). The system prompt requires a
   citation on every factual sentence, a separation between *evidence* and *interpretation*, an explicit
   *insufficient evidence* flag and a list of limitations.
6. **Verification.** Citations to non-existent sources are stripped and reported, and answers without valid citations
   are flagged. Each cited source links to the PDF page or the PSI landing page.
7. **Graceful degradation.** Without a key for the generative model, the assistant runs in *retrieval-only* mode and
   shows the most relevant NASA passages. Retrieval with Google embeddings still needs `GEMINI_API_KEY`.
   Groq offers no embedding models, which is why search uses Google's embeddings API.

Full rebuild procedure, parameters and status: **[RAG_HANDOFF.md](RAG_HANDOFF.md)**.

## AI usage disclosure (required by NASA Space Apps)

- **Development assistance:** The project scaffolding, data pipeline, backend and frontend code were written with the help
  of an AI coding assistant (Anthropic Claude, via Claude Code), under the team's direction and review. The team owns the
  concept and design decisions.
- **In the product:** answers are written by **Groq** (`openai/gpt-oss-120b`); document search uses Google's
  `gemini-embedding-001` embeddings API. No AI model runs locally. Answers are grounded in retrieved NASA documents and must cite them.
- **Data:** No data in the app is AI-generated. All values come from NASA PSI files. The curated classification in
  `curation.json` was drafted with AI assistance from the challenge text and PSI objectives, then reviewed by the team.

## Known limitations

- PSI holds **no partial-gravity combustion data** (stated in the challenge). Lunar and Martian conditions can only be
  bounded by microgravity and 1 g results.
- Experimental tables differ widely across investigations. Many report conditions as day summaries or set-point lists
  rather than per-test values, and some omit pressure or flow.
- Raw data (videos and multi-GB archives, ~TB in total) is out of scope; the app links to it on PSI.
- Fuel-family normalization is pattern-based. Samples it cannot classify confidently are shown as *unclassified*.
- The PSI API is undocumented and slow; `fetch_psi.py` may need adapting if it changes.

## Heavy tasks (run on a capable machine, not on the low-spec dev laptop)

| Task | Command | Why it is deferred |
|---|---|---|
| Build the RAG index (PDF extraction, Google embeddings, FAISS) | see [RAG_HANDOFF.md](RAG_HANDOFF.md) §8 | ~2,300 PDF pages + API batches |
| Production frontend build | `cd frontend && npm run build` | Vite/Rollup bundling of Plotly is memory-hungry |
| Re-download PSI PDFs | `python pipeline/fetch_psi.py --docs` | ~175 MB from a slow server |

## Team docs

- [docs/00-analisis-inicial.md](docs/00-analisis-inicial.md): initial analysis (in Spanish) covering the challenge,
  datasets, architecture and plan.
- [docs/01-jury-guide.md](docs/01-jury-guide.md): what we solve, NASA data, processing, AI, value, limitations and
  demo script (English).
- [RAG_HANDOFF.md](RAG_HANDOFF.md): status and rebuild instructions for the AI assistant index (Spanish).
