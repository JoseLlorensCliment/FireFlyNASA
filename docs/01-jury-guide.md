# Flame Intelligence — Guide for the jury

*NASA Space Apps Challenge 2026 · Flame in Freefall: SI-Powered Fire Safety Insights from Microgravity Combustion Data*

## 1. The problem we solve

NASA has decades of microgravity combustion results in its **Physical Sciences Informatics (PSI)** repository. As the
challenge puts it, they are hard to find, harder to compare and harder still to interpret. That matters now: Moon Base
and pressurized-rover cabins are expected to run at **≥30% O₂ and ≤10.2 psi**, which makes materials much more
flammable than in Earth air.

**Flame Intelligence** turns the PSI combustion archive into a research workspace for professors, students, aerospace
researchers and engineers. It lets them:

- find the relevant investigations;
- compare them without mixing incompatible data;
- see where evidence exists, and where it does not, for exploration atmospheres;
- get answers that cite the NASA documents behind them.

## 2. NASA data we use (core of the product, not an add-on)

| Source | Content |
|---|---|
| **NASA PSI** (psi.nasa.gov), CC0 | Records of all **24 combustion-science investigations** (ISS and Cygnus, plus ground re-analyses): BASS, BASS-II, Saffire I–III, FLEX, FLEX-2, CFI, SAME, SAME-R, DAFT, SPICE, SLICE, ACME (6 experiments) and others |
| PSI experimental tables | **22 CSV tables, about 2,000 rows**: O₂, CO₂ and He fractions, pressure, flow, fuels, burn times and outcomes |
| PSI publications | **352 publications** (235 distinct DOIs) linked to the investigations |
| PSI documents | About 70 final reports, science requirement documents and presentations, used by the AI assistant |
| NASA GRC | 8 experiment fact sheets and the *Researcher's Guide to ISS Combustion Science* |

Every number in the app links back to its PSI table cell, investigation page and dataset DOI.

## 3. How we process the data

1. **Snapshot of PSI.** The PSI site exposes no documented API, so we mapped the JSON endpoints its own web app uses.
   The download is idempotent and runs once; the app never depends on the slow PSI server at runtime.
2. **Harmonization with provenance.** Each investigation uses its own table layout, so a per-table specification maps
   columns to **9 canonical variables**: fuel, O₂ (%), pressure (kPa), flow (cm/s), flow direction, CO₂, He, burn time
   and outcome. Each value keeps:
   - the original cell;
   - its unit conversion;
   - a quality flag: measured, approximate, range, set-points, suspect or not reported.
3. **Nothing is silently fixed.**
   - Spreadsheet artefacts such as `3400%`, or a pressure of 0 during a burn, are flagged and never used.
   - Fuel names auto-filled as `CH5`, `CH6`… are kept as raw text; the fuel family comes from a reliable column.
4. **Curated, cited classification.** Each investigation's fuel phase and fire-safety role (prevention, detection,
   suppression…) is curated, and each entry states its basis: the challenge text, the PSI record or a NASA fact sheet.

## 4. How the AI works (and how it is kept honest)

- **RAG pipeline:**
  - **Corpus:** NASA PDFs, PSI records and deterministic summaries of the data tables.
  - **Chunking:** page-aware chunks with metadata (title, investigation, page, URL).
  - **Embeddings:** `fastembed` `BAAI/bge-small-en-v1.5` (384 dimensions; 4,392 pre-embedded chunks shipped with the
    repository; only the user's question is embedded at query time). Google `gemini-embedding-001` is supported as an alternative.
  - **Retrieval:** FAISS, with diversity rules, and every investigation named in the question is guaranteed to be
    covered.
  - **Answers:** written by **Groq `openai/gpt-oss-120b`** (free plan, low latency) or Google Gemini in structured JSON.
- **Answer rules:**
  - every factual sentence cites `[S#]`;
  - **evidence** (stated in sources) is kept apart from **interpretation**;
  - an explicit *insufficient evidence* flag;
  - a list of limitations.
- **Server-side verification:** citations to sources that do not exist are removed and reported. Each cited source opens
  the NASA PDF at the cited page or the PSI page.
- **No AI-generated data.** Data sections, comparisons and statistics are computed deterministically. The AI only
  drafts discussion text, from retrieved sources.

## 5. What makes it useful (modules)

| Module | Value |
|---|---|
| **Dashboard** | What the archive actually measures, including its gaps, a timeline, and fire-safety roles |
| **Experiment explorer** | Search and filters; per-investigation tables showing *what varied and what was held constant*; DOIs and publications |
| **Scientific comparator** | Comparability status per variable. Automatic warnings for different fuel phases, daily summaries versus individual tests, and inverse-flame O₂ |
| **AI assistant** | Cited answers to research questions |
| **Safety insights** | **Atmosphere coverage map** against the Moon Base and spacesuit atmospheres; FLEX suppressant outcomes; Saffire-II microgravity versus 1 g flame spread; BASS-II O₂ and CO; a **transparent relevance ranking** with adjustable weights. It is *not* a risk score |
| **Reports** | Question plus investigations produce a Markdown or PDF report with data, comparison, limitations and references, plus an optional cited AI discussion |

**A finding the tool makes visible:** of 734 PSI rows that report ambient O₂ and pressure, only **20** fall within the
expected Moon Base atmosphere. All 20 are gaseous flames (ACME CFI-G). **No solid cabin-material test in PSI reports
per-row O₂ and pressure in that region.** This is exactly the gap that future work such as FM2 and LUCI is meant to fill.

## 6. Limitations (stated in the app as well)

- PSI holds **no partial-gravity combustion data**. Microgravity and 1 g results can only bound lunar and Martian
  behaviour.
- The tables are heterogeneous. Many report day summaries or set-point lists, and some omit pressure or flow.
- Raw videos and multi-GB archives (terabytes in total) are out of scope; the app links to them on PSI.
- Fuel-family normalization is pattern-based; anything it cannot classify confidently is shown as *unclassified*.
- AI answers depend on retrieval quality. Users should open the cited passages; the interface makes this one click.

## 7. Suggested demo script (≤ 7 slides or 30 s video)

1. **Problem (5 s):** decades of NASA fire data, hard to use; Moon cabins at ≥30% O₂.
2. **Explorer (5 s):** search "extinction" and open FLEX: 274 tests, what varied, DOIs.
3. **Compare (5 s):** FLEX versus BASS. The "different fuel phases" warning shows the comparison is honest.
4. **Safety insights (8 s):** the atmosphere map shows only 20 rows in the Moon region, none with solids. That is the
   evidence gap.
5. **AI and reports (7 s):** ask a question and get a cited answer, open the PDF at the cited page, export the report.

## 8. AI usage disclosure

- **Code:** written with the help of an AI coding assistant (Anthropic Claude via Claude Code), under the team's
  direction and review.
- **Product:** Groq (`openai/gpt-oss-120b`) writes the assistant's answers; the open `BAAI/bge-small-en-v1.5`
  embedding model (via fastembed) powers document search.
- **Data:** no data is AI-generated.
- **Branding:** no NASA logos or branding are used.
