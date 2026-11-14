"""Scientific report builder.

Data sections are deterministic (straight from flame.db); the optional AI discussion
comes from the RAG assistant and keeps its [S#] citations, which are resolved in the
reference list. The report is returned both as structured JSON and as Markdown.
"""
from __future__ import annotations

from datetime import datetime, timezone

from app.models.database import query, query_one
from app.services.compare import NUMERIC, ROW_KIND_LABEL, _numeric_stats, _rows, compare

GENERIC_LIMITATIONS = [
    "All data are microgravity (or ground re-analysis) results; NASA PSI holds no partial-gravity combustion data.",
    "Harmonized values come from heterogeneous PSI tables; approximate, derived and set-point values are flagged.",
    "Investigations differ in fuel phase, geometry and flow; results are not directly interchangeable.",
]


def _inv(acc: str) -> dict | None:
    return query_one("""SELECT accession, acronym, title, project_type, flight_platform, start_date, end_date,
                        fuel_phase, roles, hardware, doi, psi_url, objectives, n_tests FROM investigations
                        WHERE accession = ?""", (acc,))


def _fmt(v, nd=3):
    if v is None:
        return "—"
    return f"{v:.{nd}g}" if isinstance(v, float) else str(v)


def build_report(question: str, accessions: list[str], include_ai: bool = False) -> dict:
    invs = [i for i in (_inv(a) for a in accessions) if i]
    if not invs:
        raise ValueError("No valid investigation selected")
    accs = [i["accession"] for i in invs]
    info = {r["key"]: r["value"] for r in query("SELECT key, value FROM dataset_info")}

    # ---- data per investigation ------------------------------------------------
    data = []
    for inv in invs:
        rows = _rows(inv["accession"])
        kinds = {}
        for r in rows:
            kinds[r["kind"]] = kinds.get(r["kind"], 0) + 1
        data.append({"accession": inv["accession"], "acronym": inv["acronym"],
                     "rows": ", ".join(f"{v} {ROW_KIND_LABEL.get(k, k)}" for k, v in kinds.items()) or "no PSI table",
                     "variables": {key: {"label": label, "unit": unit, **_numeric_stats(rows, key)}
                                   for key, label, unit in NUMERIC}})

    comparison = compare(accs) if len(accs) >= 2 else None

    # ---- optional AI discussion ------------------------------------------------
    ai = None
    if include_ai:
        try:
            from app.ai import assistant
            ai = assistant.ask(question, accs)
        except RuntimeError as exc:  # missing/incompatible index, missing key...
            ai = {"mode": "unavailable", "answer": None, "warnings": [str(exc)], "sources": [],
                  "evidence": [], "interpretation": [], "limitations": []}

    # ---- references ----------------------------------------------------------------
    references = []
    for inv in invs:
        references.append({"type": "dataset", "label": f"NASA PSI {inv['accession']} — {inv['title']}",
                           "doi": inv["doi"], "url": inv["psi_url"]})
        for p in query("SELECT title, authors, doi FROM publications WHERE accession = ? AND doi IS NOT NULL "
                       "ORDER BY title LIMIT 6", (inv["accession"],)):
            references.append({"type": "publication", "label": f"{p['authors'] or ''}. {p['title']}".strip(". "),
                               "doi": p["doi"], "url": f"https://doi.org/{p['doi']}"})
    cited = [s for s in (ai or {}).get("sources", []) if s.get("cited")]

    report = {
        "title": f"Flame Intelligence report: {question}",
        "question": question,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "data_source": info.get("source"),
        "snapshot_built_at": info.get("built_at"),
        "investigations": invs,
        "data": data,
        "comparison": comparison and {"warnings": comparison["warnings"],
                                      "variables": [{k: v[k] for k in ("key", "label", "status", "note")}
                                                    for v in comparison["variables"]]},
        "ai": ai,
        "limitations": GENERIC_LIMITATIONS + list((ai or {}).get("limitations") or []),
        "references": references,
        "cited_sources": cited,
    }
    report["markdown"] = to_markdown(report)
    return report


def to_markdown(r: dict) -> str:
    L = [f"# {r['title']}", "",
         f"*Generated {r['generated_at']} by Flame Intelligence from {r['data_source']} "
         f"(snapshot {r['snapshot_built_at']}).*", "",
         "## 1. Research question", "", r["question"], "",
         "## 2. Investigations consulted", ""]
    for i in r["investigations"]:
        L.append(f"- **{i['acronym'] or i['accession']}** ({i['accession']}) — {i['title']}. {i['project_type']}, "
                 f"{i['flight_platform'] or 'n/a'}, {i['start_date'] or '?'} → {i['end_date'] or '?'}; "
                 f"fuel phase: {i['fuel_phase']}; role: {', '.join(i['roles'] or [])}. "
                 f"Dataset DOI: {i['doi'] or 'n/a'}.")
    L += ["", "## 3. Relevant data (harmonized PSI tables)", "",
          "| Investigation | Rows | " + " | ".join(f"{lab} ({u})" for _, lab, u in NUMERIC) + " |",
          "|---|---|" + "---|" * len(NUMERIC)]
    for d in r["data"]:
        cells = []
        for key, _, _ in NUMERIC:
            v = d["variables"][key]
            cells.append("n/r" if not v["n"] else
                         (f"{_fmt(v['min'])}" if v["min"] == v["max"] else f"{_fmt(v['min'])}–{_fmt(v['max'])}")
                         + f" ({v['n']}/{v['of']})")
        L.append(f"| {d['acronym'] or d['accession']} | {d['rows']} | " + " | ".join(cells) + " |")
    L += ["", "Values: min–max over rows reporting the variable (rows reporting / total). n/r = not reported.", ""]
    if r["comparison"]:
        L += ["## 4. Comparison", ""]
        for w in r["comparison"]["warnings"]:
            L.append(f"- **{w['title']}** ({w['level']}): {w['text']}")
        L += ["", "| Variable | Comparability |", "|---|---|"]
        L += [f"| {v['label']} | {v['status'].replace('_', ' ')} |" for v in r["comparison"]["variables"]]
        L.append("")
    n = 5 if r["comparison"] else 4
    L += [f"## {n}. Conclusions (AI-assisted discussion)", ""]
    ai = r["ai"]
    if not ai:
        L += ["*Not requested. Enable the AI discussion to draft a cited synthesis.*", ""]
    elif not ai.get("answer"):
        L += [f"*AI discussion unavailable: {'; '.join(ai.get('warnings') or [])}*", ""]
    else:
        L += [ai["answer"], ""]
        if ai.get("evidence"):
            L += ["**Evidence (stated in the sources)**", ""] + [
                f"- {e['statement']} {' '.join('[' + s + ']' for s in e['sources'])}" for e in ai["evidence"]] + [""]
        if ai.get("interpretation"):
            L += ["**Interpretation (reasoning across sources)**", ""] + [
                f"- {e['statement']} {' '.join('[' + s + ']' for s in e['sources'])}" for e in ai["interpretation"]] + [""]
        L += [f"*Generated by {ai.get('model', 'an LLM')} from retrieved NASA sources; verify cited passages.*", ""]
    L += [f"## {n + 1}. Limitations", ""] + [f"- {x}" for x in r["limitations"]] + [""]
    L += [f"## {n + 2}. References", ""]
    for s in r["cited_sources"]:
        loc = f", p. {s['page']}" if s.get("page") else ""
        L.append(f"- [{s['id']}] {s['title']}{loc}. {s.get('url') or ''}")
    for ref in r["references"]:
        L.append(f"- {ref['label']}. " + (f"https://doi.org/{ref['doi']}" if ref.get("doi") else ref.get("url") or ""))
    L += ["", "---", "*Data: NASA Physical Sciences Informatics (CC0-1.0). Independent project, not endorsed by NASA.*"]
    return "\n".join(L)
