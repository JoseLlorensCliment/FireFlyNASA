# NASA Space Apps 2026 — submission form answers

Copy each block into the matching field. All figures come from the app's own API (`/api/stats`, `/api/insights/atmospheres`, `/api/assistant/status`).

---

## Project Name

Flame Intelligence: Microgravity Fire-Safety Evidence Explorer

---

## Summary (≈190 words)

Flame Intelligence turns NASA's microgravity combustion archive into an evidence tool for fire safety on the Moon. It unifies 24 investigations from NASA Physical Sciences Informatics (PSI) — 1,982 experimental test rows, 352 publications and 9 harmonized variables such as oxygen, pressure, flow and outcome — into one web app where anyone can search, compare and question the data.

The challenge asks how fire behaves in the oxygen-enriched, low-pressure atmospheres planned for Moon bases and rovers (≥30% O₂ at ≤10.2 psi). Our map plots every PSI row that reports both oxygen and pressure against those exploration atmospheres and shows the gap plainly: only 20 of 734 ambient-atmosphere rows fall inside the expected Moon Base region, and none of them are solid cabin-material tests.

Researchers can compare 2–4 investigations side by side, with automatic warnings when fuel phase, data type or variable definitions differ. A research assistant answers questions only from 4,392 indexed passages of 113 NASA documents, and every claim cites its source and opens the PDF at the right page. This matters because fire-safety decisions for Artemis need evidence that is traceable, not guessed.

---

## Project Demonstration (link)

<!-- Upload video/out/flame-intelligence-promo.mp4 (30 s) to YouTube (Unlisted is fine, NOT Private) or Google Drive ("Anyone with the link"), then paste the full URL here. -->
https://…

## Project (link)

https://github.com/JoseLlorensCliment/FireFlyNASA

---

## Project Details

**What it does**

Flame Intelligence is a web application with six modules built on NASA PSI combustion data:

1. **Dashboard** — an overview of the archive: what it measures, which fire-safety role each investigation serves (prevention, detection, suppression, modeling), a timeline of the investigations from 1999 to 2025, and an interactive 3D flame that shows how gravity shapes a flame (a teardrop on Earth, a sphere in microgravity). The flame is labelled as a qualitative illustration, not a simulation.
2. **Experiments** — search and filter the 24 investigations by fuel phase, role, platform and hardware, with each investigation's tables, publications and DOIs.
3. **Compare** — 2–4 investigations side by side on harmonized variables only. Differences in fuel phase, data type and variable definitions are flagged automatically, so a comparison is never assumed to be like-for-like.
4. **AI research assistant** — retrieval-augmented answers drawn only from NASA sources (PSI records, table summaries, PSI documents and NASA fact sheets). Answers keep evidence, interpretation and limitations separate, cite numbered sources, and open the original PDF at the cited page. If no language model is available, it still returns the most relevant NASA passages.
5. **Safety insights** — descriptive analyses with their method and limitations stated:
   - tested atmospheres vs. Moon Base, Earth and spacesuit atmospheres;
   - a transparent relevance ranking for each scenario, with adjustable weights;
   - FLEX droplet suppression outcomes;
   - Saffire-II flame spread at 1 g vs. microgravity;
   - BASS-II combustion products.
6. **Reports** — generates a scientific report (Markdown or PDF) from a research question and selected investigations, with references.

**Key finding**

Only 20 of 734 ambient-atmosphere test rows in PSI fall inside the expected Moon Base atmosphere, all from one gaseous-flame investigation (ACME CFI-G). No solid cabin-material test reports per-row oxygen and pressure in that region. PSI also has no partial-gravity combustion data, so lunar behaviour can only be bounded by microgravity and 1-g results. The app states these limits instead of hiding them.

**Benefits and intended impact**

- Mission planners and fire-safety engineers get one place to see what has and has not been tested, before choosing materials and atmospheres for Artemis habitats and rovers.
- Researchers can spot under-tested conditions and plan the next experiments.
- Students and the public get an accurate, sourced explanation of how fire behaves in space, plus the Earth benefits of this research (NASA Spinoff examples).

**How it works / tools**

- **Data pipeline:** Python. It downloads the PSI investigation records, experimental tables and documents, then harmonizes units and variable names (oxygen to %, pressure to kPa, and so on) with documented rules.
- **Backend:** Python with FastAPI.
- **Retrieval:** local embeddings (BAAI/bge-small-en-v1.5 via fastembed) and a FAISS vector index of 4,392 passages from 113 NASA documents. The index is checked against a manifest (hash, counts, dimension) at start-up.
- **Language model:** Groq API with openai/gpt-oss-120b in JSON mode. Every answer must cite retrieved sources; uncited claims are flagged.
- **Frontend:** React, TypeScript, Vite, Tailwind CSS and Plotly. The 3D flame is a custom WebGL volumetric raymarching shader, with a 2D canvas fallback.
- **Accessibility:** the chart colour palette was validated for colour-blind readers, and every chart has a table view.
- **Demo video:** Remotion (React). It reuses the app's own WebGL flame renderer and real data from the API.

**Creativity**

- The coverage map turns a vague question ("is there enough evidence for the Moon?") into a measurable gap.
- The comparator refuses false comparisons.
- The assistant treats citations as links you can open, not decoration.
- The 3D flame lets people feel the physics in seconds.

**Factors we considered**

- **Scientific honesty:** no invented data and no arbitrary risk scores. Every analysis shows its method and limitations, and uncertain values are marked "use with care".
- **Low cost:** free and open tools, and local embeddings, so the RAG index runs without paid services.
- **Accessibility:** colour-blind-safe charts, keyboard navigation and reduced-motion support.
- **Performance:** the WebGL flame adapts its quality so it runs on modest laptops.

---

## Use of Super Intelligence (SI)

Select (adjust if your team used other tools):

- ☑ **Code** — Claude Code (Anthropic) assisted with writing and reviewing code for the pipeline, backend, frontend and demo video.
- ☑ **Text** — SI assisted with drafting documentation and these submission texts.
- ☑ **SI inside the product** — the research assistant uses a large language model (openai/gpt-oss-120b via Groq) to draft answers from retrieved NASA sources. The app labels these answers as AI-generated and shows their citations.
- ☑ **Video** — the demo video was built in code (Remotion) with SI assistance. It has no SI-generated imagery: it shows screenshots of the real app, real data charts and the app's own WebGL flame. It carries a visible "AI-assisted · built with SI tools" watermark for its full length.
- ☐ Images / ☐ Audio — not used.

Acknowledgement to add in the README (rules ask for it in descriptive text): "Parts of this codebase and its documentation were written with the assistance of AI tools (Claude Code by Anthropic). The in-app assistant uses a large language model via Groq; its answers are generated from retrieved NASA sources and are labelled as AI-generated."

No NASA logos, flags or mission insignia are used anywhere in the app or video.

---

## NASA Data (Link Text → Link URL)

| Link Text | Link URL |
|---|---|
| NASA Physical Sciences Informatics (PSI) — combustion investigations, experimental tables and documents | https://psi.nasa.gov/physci/repo |
| NASA PSI — combustion search | https://psi.nasa.gov/physci/repo/search?q=combustion |
| A Researcher's Guide to: Combustion Science (ISS, 2015) | https://www.nasa.gov/missions/station/a-researchers-guide-to-combustion-science/ |
| NASA Glenn — Combustion Science (Physical Sciences Program) | https://www.nasa.gov/glenn/glenn-expertise-space-exploration/physical-sciences-program/combustion-science/ |
| NASA fact sheet — Advanced Combustion via Microgravity Experiments (ACME) | https://www.nasa.gov/wp-content/uploads/2025/07/advanced-combustion-via-microgravity-experiments-acme.pdf |
| NASA fact sheet — Burning and Suppression of Solids (BASS) | https://www.nasa.gov/wp-content/uploads/2025/07/burning-and-suppression-of-solids-bass.pdf |
| NASA fact sheet — Dust and Aerosol Measurement Feasibility Test (DAFT) | https://www.nasa.gov/wp-content/uploads/2025/07/dust-and-aerosol-measurement-feasibility-test-daft.pdf |
| NASA fact sheet — Flame Extinguishment Experiment (FLEX) | https://www.nasa.gov/wp-content/uploads/2025/07/flame-extinguishment-experiment-flex.pdf |
| NASA fact sheet — Smoke Aerosol Measurement Experiment (SAME) | https://www.nasa.gov/wp-content/uploads/2025/07/smoke-aerosol-measurement-experiment-same.pdf |
| NASA fact sheet — Smoke Point In Co-flow Experiment (SPICE) | https://www.nasa.gov/wp-content/uploads/2025/07/smoke-point-in-co-flow-experiment-spice.pdf |
| NASA fact sheet — Spacecraft Fire Safety Demonstration (Saffire) | https://www.nasa.gov/wp-content/uploads/2025/07/spacecraft-fire-safety-demonstration-saffire.pdf |
| NASA fact sheet — Structure & Liftoff In Combustion Experiment (SLICE) | https://www.nasa.gov/wp-content/uploads/2025/07/structure-liftoff-in-combustion-experiment-slice.pdf |
| NASA Spinoff — Fire Detector | https://spinoff.nasa.gov/node/9407 |
| NASA Spinoff — Fire Attire | https://spinoff.nasa.gov/node/9918 |
| NASA Spinoff — Fireman's Air Tanks | https://spinoff.nasa.gov/node/9582 |

---

## Space Agency Partner & Other Data (Link Text → Link URL)

| Link Text | Link URL |
|---|---|
| Groq API (LLM inference) | https://groq.com |
| openai/gpt-oss-120b (language model) | https://huggingface.co/openai/gpt-oss-120b |
| BAAI/bge-small-en-v1.5 (embedding model) | https://huggingface.co/BAAI/bge-small-en-v1.5 |
| fastembed (local embeddings) | https://github.com/qdrant/fastembed |
| FAISS (vector search) | https://github.com/facebookresearch/faiss |
| FastAPI | https://fastapi.tiangolo.com |
| React | https://react.dev |
| Vite | https://vite.dev |
| Tailwind CSS | https://tailwindcss.com |
| Plotly.js (charts) | https://plotly.com/javascript/ |
| Lucide (icons) | https://lucide.dev |
| Inter (font) | https://fonts.google.com/specimen/Inter |
| JetBrains Mono (font) | https://fonts.google.com/specimen/JetBrains+Mono |
| Remotion (demo video) | https://www.remotion.dev |
| Claude Code by Anthropic (SI coding assistant) | https://www.anthropic.com/claude-code |
