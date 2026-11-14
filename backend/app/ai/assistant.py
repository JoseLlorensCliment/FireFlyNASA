"""Retrieval-augmented scientific assistant with verifiable citations."""
from __future__ import annotations

import re

from app.ai import retriever
from app.ai.llm import LLMUnavailable, complete_json

SYSTEM_PROMPT = """You are Flame Intelligence, a scientific research assistant for NASA microgravity combustion and \
spacecraft fire-safety research. You answer researchers and engineers.

STRICT RULES
1. Use ONLY the numbered SOURCES provided. Do not use outside knowledge for facts, numbers, names or results.
   You may use general scientific knowledge only to define a term, and you must label it "(background)".
2. Every factual sentence in "answer" must end with one or more citations like [S2] or [S1][S4].
3. Separate EVIDENCE (stated explicitly in a source) from INTERPRETATION (your reasoning that connects sources).
   Never present an interpretation as an experimental result.
4. If the sources do not contain enough information, say so plainly, set "sufficient" to false, and explain what
   is missing. Do not guess or extrapolate numbers.
5. When comparing investigations, do not treat them as equivalent: point out differences in fuel phase
   (solid/liquid/gas), geometry, flow, pressure, oxygen definition and data type (single test vs daily summary).
6. Always state limitations: e.g. microgravity-only data (PSI has no partial-gravity combustion data), small sample
   counts, approximate or derived values, conditions far from exploration atmospheres.
7. Be concise and precise. Use SI units as given in the sources.

Return a JSON object with exactly these keys:
{
  "answer": "Markdown, 1-4 short paragraphs or a short list, with [S#] citations",
  "evidence": [{"statement": "...", "sources": ["S1"]}],
  "interpretation": [{"statement": "...", "sources": ["S2", "S3"]}],
  "limitations": ["..."],
  "sufficient": true,
  "follow_up": ["up to 3 useful next questions"]
}"""

CITE = re.compile(r"\[S(\d+)\]")


def _format_sources(chunks: list[dict]) -> str:
    parts = []
    for i, c in enumerate(chunks, start=1):
        loc = f", page {c['page']}" if c.get("page") else ""
        parts.append(f"[S{i}] {c['title']}{loc} ({c.get('accession') or 'NASA'})\n{c['text']}")
    return "\n\n---\n\n".join(parts)


def _public_source(i: int, c: dict) -> dict:
    snippet = re.sub(r"\s+", " ", c["text"])[:420]
    return {
        "id": f"S{i}", "title": c["title"], "accession": c.get("accession"), "page": c.get("page"),
        "url": c.get("url"), "source_type": c["source_type"], "doc_id": c["doc_id"],
        "has_local_file": bool(c.get("local_path")), "chunk_id": c["id"], "snippet": snippet, "score": c["score"],
    }


def _clean_items(items, valid: set[str]) -> list[dict]:
    out = []
    for it in items or []:
        if isinstance(it, str):
            it = {"statement": it, "sources": CITE.findall(it)}
        srcs = [s if str(s).startswith("S") else f"S{s}" for s in it.get("sources", [])]
        srcs = [s for s in srcs if s in valid]
        out.append({"statement": str(it.get("statement", "")).strip(), "sources": srcs})
    return [o for o in out if o["statement"]]


_CACHE: dict[tuple, dict] = {}


def _answer(question: str, accessions: tuple[str, ...], k: int) -> dict:
    chunks = retriever.search(question, k=k, accessions=list(accessions) or None)
    sources = [_public_source(i, c) for i, c in enumerate(chunks, start=1)]
    valid = {s["id"] for s in sources}
    base = {"question": question, "sources": sources, "focus": retriever.mentioned_accessions(question)}
    if not chunks:
        return base | {"mode": "no_sources", "answer": "No relevant NASA source was found for this question.",
                       "evidence": [], "interpretation": [], "limitations": [], "sufficient": False,
                       "follow_up": [], "warnings": []}
    user = f"QUESTION:\n{question}\n\nSOURCES:\n{_format_sources(chunks)}"
    try:
        data, model = complete_json(SYSTEM_PROMPT, user)
    except LLMUnavailable as exc:
        return base | {"mode": "retrieval_only", "answer": None, "evidence": [], "interpretation": [],
                       "limitations": [], "sufficient": None, "follow_up": [], "warnings": [str(exc)]}

    answer = str(data.get("answer", "")).strip()
    answer = re.sub(r"【S?(\d+)[^】]*】", r"[S\1]", answer)
    warnings = []
    cited = set(f"S{n}" for n in CITE.findall(answer))
    invalid = cited - valid
    if invalid:
        answer = CITE.sub(lambda m: m.group(0) if f"S{m.group(1)}" in valid else "", answer)
        warnings.append(f"Removed citations to non-existent sources: {sorted(invalid)}")
    if not cited & valid:
        warnings.append("The answer contains no valid citation — treat it with caution.")
    for s in sources:
        s["cited"] = s["id"] in cited
    return base | {
        "mode": "generated", "model": model, "answer": answer,
        "evidence": _clean_items(data.get("evidence"), valid),
        "interpretation": _clean_items(data.get("interpretation"), valid),
        "limitations": [str(x) for x in data.get("limitations") or []],
        "sufficient": bool(data.get("sufficient", True)),
        "follow_up": [str(x) for x in (data.get("follow_up") or [])][:3],
        "warnings": warnings,
    }


def ask(question: str, accessions: list[str] | None = None, k: int = 8) -> dict:
    key = (question.strip().lower(), tuple(sorted(accessions or [])), k)
    if key in _CACHE:
        return _CACHE[key] | {"cached": True}
    res = _answer(question.strip(), key[1], k)
    if res["mode"] == "generated":  # never cache failures (e.g. missing key, rate limit)
        _CACHE[key] = res
    return res
