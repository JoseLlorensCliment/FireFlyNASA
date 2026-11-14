"""Validate a built RAG index and (optionally) a cited end-to-end answer.

Checks
  1. index files exist; vector count == chunk count; manifest embedding == current .env settings
  2. every chunk with a local_path points to an existing file (PDFs present on this machine)
  3. retrieval: each test question returns sources from the expected investigation(s)
  4. --answer: the LLM answer cites [S#] that exist in the returned sources, each with a title/URL

Usage
  python pipeline/rag_smoke_test.py              # checks 1-3 (needs the embedding API key for queries)
  python pipeline/rag_smoke_test.py --answer     # + check 4 (calls the generative model once)
Exit code 0 = all checks passed.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.ai import assistant, retriever  # noqa: E402
from app.ai.embeddings import signature  # noqa: E402
from app.core.config import get_settings  # noqa: E402

# Questions whose correct sources are known from the PSI catalogue (accessions in flame.db).
RETRIEVAL_CASES = [
    ("Which inert gases were used to suppress droplet flames in FLEX?", {"PSI-69", "PSI-68"}),
    ("Flame spread over cotton-fiberglass SIBAL fabric in the Saffire experiments", {"PSI-98", "PSI-99", "PSI-100"}),
    ("Smoke particle measurements for spacecraft fire detection", {"PSI-101", "PSI-102", "PSI-115"}),
    ("Oxygen-enriched inverse flames up to 85% oxygen", {"PSI-159", "PSI-10"}),
]
ANSWER_QUESTION = "How does oxygen concentration affect flame extinction in the FLEX droplet experiments?"


def rag_dir() -> Path:
    return get_settings().data_dir / "processed" / "rag"


def check_index() -> list[str]:
    errors = []
    d = rag_dir()
    for f in ("index.faiss", "chunks.jsonl", "manifest.json"):
        if not (d / f).exists():
            errors.append(f"missing {d / f}")
    if errors:
        return errors
    manifest = json.loads((d / "manifest.json").read_text(encoding="utf-8"))
    if manifest.get("embedding") != signature():
        errors.append(f"manifest embedding {manifest.get('embedding')} != current settings {signature()}")
    try:
        index, chunks = retriever._load()
    except RuntimeError as exc:
        return errors + [str(exc)]
    print(f"[ok] index: {index.ntotal} vectors, dim {index.d}; {len(chunks)} chunks; embedding {signature()}")
    missing = sorted({c["local_path"] for c in chunks if c.get("local_path") and not (ROOT / c["local_path"]).exists()})
    if missing:
        errors.append(f"{len(missing)} source PDFs referenced by the index are missing locally, e.g. {missing[:3]}")
    else:
        print(f"[ok] all {len({c['doc_id'] for c in chunks})} source documents are present or are PSI records/tables")
    return errors


def check_retrieval(k: int = 8) -> list[str]:
    errors = []
    for q, expected in RETRIEVAL_CASES:
        hits = retriever.search(q, k=k)
        got = {h.get("accession") for h in hits}
        ok = bool(got & expected)
        top = hits[0]["title"] if hits else "-"
        print(f"[{'ok' if ok else 'FAIL'}] {q!r}\n       top: {top} | accessions: {sorted(a for a in got if a)}")
        if not ok:
            errors.append(f"retrieval for {q!r} did not return any of {sorted(expected)}")
    return errors


def check_answer() -> list[str]:
    r = assistant.ask(ANSWER_QUESTION)
    if r["mode"] != "generated":
        return [f"no generated answer (mode={r['mode']}): {r.get('warnings')}"]
    cited = set(re.findall(r"\[S(\d+)\]", r["answer"] or ""))
    ids = {s["id"][1:] for s in r["sources"]}
    print(f"[ok] model {r.get('model')} answered ({len(r['answer'])} chars), sufficient={r['sufficient']}")
    for s in r["sources"]:
        if s.get("cited"):
            print(f"       {s['id']}: {s['title']} (p.{s.get('page') or '-'}) {s.get('url') or ''}")
    errors = []
    if not cited:
        errors.append("answer has no [S#] citations")
    if cited - ids:
        errors.append(f"answer cites unknown sources {sorted(cited - ids)}")
    if any(not s.get("title") or not (s.get("url") or s.get("has_local_file")) for s in r["sources"] if s.get("cited")):
        errors.append("a cited source has no title or no link")
    if r.get("warnings"):
        print(f"       warnings: {r['warnings']}")
    return errors


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--answer", action="store_true", help="also call the generative model once")
    args = ap.parse_args()
    errors = check_index()
    if not errors:
        errors += check_retrieval()
        if args.answer:
            errors += check_answer()
    print("\nRESULT:", "PASS" if not errors else "FAIL")
    for e in errors:
        print("  -", e)
    return 0 if not errors else 1


if __name__ == "__main__":
    sys.exit(main())
