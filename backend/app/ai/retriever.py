"""Semantic retrieval over the NASA corpus (FAISS, cosine similarity)."""
from __future__ import annotations

import json
import re
from functools import lru_cache

import faiss
import numpy as np

from app.ai.embeddings import embed_query, signature
from app.core.config import get_settings
from app.models.database import query

MAX_PER_DOC = 3


@lru_cache
def _load():
    rag = get_settings().data_dir / "processed" / "rag"
    if not (rag / "index.faiss").exists():
        raise RuntimeError("RAG index not found. Run: python pipeline/build_rag_index.py")
    manifest = json.loads((rag / "manifest.json").read_text(encoding="utf-8"))
    built_with = manifest.get("embedding", {})
    current = signature()
    if built_with and built_with != current:
        raise RuntimeError(f"RAG index was built with {built_with} but the API is configured for {current}. "
                           "Use the same EMBEDDING_* settings or rebuild the index.")
    index = faiss.read_index(str(rag / "index.faiss"))
    with (rag / "chunks.jsonl").open(encoding="utf-8") as fh:
        chunks = [json.loads(line) for line in fh]
    if index.ntotal != len(chunks):
        raise RuntimeError(f"Index has {index.ntotal} vectors but chunks.jsonl has {len(chunks)} lines; rebuild.")
    return index, chunks


def index_info() -> dict:
    try:
        index, chunks = _load()
    except RuntimeError as exc:
        return {"ready": False, "error": str(exc)}
    return {"ready": True, "n_chunks": len(chunks),
            "n_documents": len({c["doc_id"] for c in chunks}), "embedding": signature()}


@lru_cache
def _acronyms() -> dict[str, str]:
    """Map lowercase acronym tokens (FLEX, BASS-II, SAFFIRE-I, CFI-G...) to accession."""
    out = {}
    for r in query("SELECT accession, acronym FROM investigations WHERE acronym IS NOT NULL"):
        for part in re.split(r"\s*/\s*", r["acronym"]):
            out[part.lower()] = r["accession"]
            if part.lower().startswith("acme "):
                out[part.lower()[5:]] = r["accession"]
    return out


def mentioned_accessions(text: str) -> list[str]:
    t = text.lower()
    found = []
    for acr, acc in sorted(_acronyms().items(), key=lambda x: -len(x[0])):
        if re.search(rf"(?<![\w-]){re.escape(acr)}(?![\w-])", t) and acc not in found:
            found.append(acc)
    found += [a.upper() for a in re.findall(r"\bpsi-\d+\b", t) if a.upper() not in found]
    return found


def search(question: str, k: int = 8, accessions: list[str] | None = None) -> list[dict]:
    index, chunks = _load()
    qv = embed_query(question)
    n = min(len(chunks), 400)
    scores, ids = index.search(qv, n)
    ranked = [(float(s), chunks[i]) for s, i in zip(scores[0], ids[0]) if i >= 0]

    focus = accessions or mentioned_accessions(question)
    if accessions:
        ranked = [(s, c) for s, c in ranked if c.get("accession") in accessions]

    picked: list[tuple[float, dict]] = []
    per_doc: dict[str, int] = {}

    def take(s: float, c: dict) -> bool:
        if per_doc.get(c["doc_id"], 0) >= MAX_PER_DOC or any(p[1]["id"] == c["id"] for p in picked):
            return False
        per_doc[c["doc_id"]] = per_doc.get(c["doc_id"], 0) + 1
        picked.append((s, c))
        return True

    # Guarantee coverage of every investigation named in the question (fair comparisons).
    if focus:
        per_focus = max(2, k // max(1, len(focus)))
        for acc in focus:
            got = 0
            for s, c in ranked:
                if c.get("accession") == acc and take(s, c):
                    got += 1
                    if got >= per_focus:
                        break
    for s, c in ranked:
        if len(picked) >= k:
            break
        take(s, c)

    picked.sort(key=lambda p: -p[0])
    return [{**c, "score": round(s, 4)} for s, c in picked[: max(k, len(picked))]]


def to_array(v) -> np.ndarray:  # pragma: no cover - helper for notebooks
    return np.asarray(v, dtype="float32")
