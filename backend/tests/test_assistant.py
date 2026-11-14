"""Assistant logic tests with retrieval and LLM mocked (no network, no index needed)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.ai import assistant  # noqa: E402
from app.ai.llm import LLMUnavailable  # noqa: E402

CHUNKS = [
    {"id": 1, "doc_id": "PSI-69:record", "title": "PSI record PSI-69 (FLEX)", "accession": "PSI-69", "page": None,
     "url": "https://psi.nasa.gov/x", "source_type": "psi_record", "text": "FLEX studied CO2 and He suppression.", "score": 0.8},
    {"id": 2, "doc_id": "nasa:flex.pdf", "title": "NASA GRC fact sheet: FLEX", "accession": "PSI-69", "page": 2,
     "url": "https://nasa.gov/flex.pdf", "source_type": "nasa_doc", "local_path": "data/raw/x.pdf",
     "text": "Oxygen mole fractions from 0.10 to 0.50.", "score": 0.7},
]


def setup_function():
    assistant._CACHE.clear()


def test_invalid_citations_are_removed(monkeypatch):
    monkeypatch.setattr(assistant.retriever, "search", lambda q, k, accessions=None: [dict(c) for c in CHUNKS])
    monkeypatch.setattr(assistant.retriever, "mentioned_accessions", lambda q: ["PSI-69"])
    monkeypatch.setattr(assistant, "complete_json", lambda s, u: ({
        "answer": "FLEX used CO2 and He [S1]. O2 ranged 10-50% [S2]. Invented [S9].",
        "evidence": [{"statement": "CO2 and He were tested", "sources": ["S1", "S9"]}],
        "interpretation": [], "limitations": ["microgravity only"], "sufficient": True, "follow_up": []}, "test-model"))
    r = assistant.ask("What did FLEX test?")
    assert r["mode"] == "generated"
    assert "[S9]" not in r["answer"]
    assert r["evidence"][0]["sources"] == ["S1"]
    assert any("non-existent" in w for w in r["warnings"])
    assert [s["cited"] for s in r["sources"]] == [True, True]


def test_retrieval_only_when_llm_unavailable(monkeypatch):
    monkeypatch.setattr(assistant.retriever, "search", lambda q, k, accessions=None: [dict(c) for c in CHUNKS])
    monkeypatch.setattr(assistant.retriever, "mentioned_accessions", lambda q: [])

    def boom(s, u):
        raise LLMUnavailable("GROQ_API_KEY is not set")
    monkeypatch.setattr(assistant, "complete_json", boom)
    r = assistant.ask("oxygen effects")
    assert r["mode"] == "retrieval_only" and r["answer"] is None and len(r["sources"]) == 2
    assert assistant._CACHE == {}  # failures are not cached
