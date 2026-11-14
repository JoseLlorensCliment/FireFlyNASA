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


def test_openai_groq_citation_brackets_are_normalized(monkeypatch):
    monkeypatch.setattr(assistant.retriever, "search", lambda q, k, accessions=None: [dict(c) for c in CHUNKS])
    monkeypatch.setattr(assistant.retriever, "mentioned_accessions", lambda q: ["PSI-69"])
    monkeypatch.setattr(assistant, "complete_json", lambda s, u: ({
        "answer": "FLEX tested CO2 suppression 【S1†L1-L7】 and ambient oxygen 【2†source】. Both are documented.",
        "evidence": [{"statement": "Suppression was verified", "sources": ["S1"]}],
        "interpretation": [], "limitations": [], "sufficient": True, "follow_up": []}, "test-model"))
    r = assistant.ask("What did FLEX test?")
    assert "[S1]" in r["answer"]
    assert "[S2]" in r["answer"]
    assert "【" not in r["answer"]
    assert len(r["warnings"]) == 0


def test_retrieval_only_when_llm_unavailable(monkeypatch):
    assistant._CACHE.clear()
    monkeypatch.setattr(assistant.retriever, "search", lambda q, k, accessions=None: [dict(c) for c in CHUNKS])
    monkeypatch.setattr(assistant.retriever, "mentioned_accessions", lambda q: [])

    def boom(s, u):
        raise LLMUnavailable("GROQ_API_KEY is not set")
    monkeypatch.setattr(assistant, "complete_json", boom)
    r = assistant.ask("oxygen effects")
    assert r["mode"] == "retrieval_only" and r["answer"] is None and len(r["sources"]) == 2
    assert assistant._CACHE == {}  # failures are not cached


def test_groq_adapter_sends_json_mode_and_reasoning_effort(monkeypatch):
    """No network: the Groq client is replaced by a fake that records the request."""
    import sys as _sys
    from types import ModuleType, SimpleNamespace

    from app.ai import llm
    from app.core.config import Settings

    sent = {}

    class FakeGroq:
        def __init__(self, api_key):
            sent["api_key_set"] = bool(api_key)
            self.chat = SimpleNamespace(completions=SimpleNamespace(create=self.create))

        def create(self, **kw):
            sent.update(kw)
            return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content='{"answer": "ok [S1]"}'))])

    fake_mod = ModuleType("groq")
    fake_mod.Groq = FakeGroq
    monkeypatch.setitem(_sys.modules, "groq", fake_mod)
    monkeypatch.setattr(llm, "get_settings", lambda: Settings(llm_provider="groq", groq_api_key="k"))
    data, model = llm.complete_json("sys", "user", max_tokens=8192)
    assert data == {"answer": "ok [S1]"} and model == "openai/gpt-oss-120b"
    assert sent["response_format"] == {"type": "json_object"}
    assert sent["extra_body"] == {"reasoning_effort": "low"} and sent["max_tokens"] == 2048


def test_missing_groq_key_gives_clear_error(monkeypatch):
    from app.ai import llm
    from app.core.config import Settings

    monkeypatch.setattr(llm, "get_settings", lambda: Settings(llm_provider="groq", groq_api_key=None))
    try:
        llm.complete_json("s", "u")
        raise AssertionError("expected LLMUnavailable")
    except llm.LLMUnavailable as exc:
        assert "GROQ_API_KEY" in str(exc)


def test_normalize_fullwidth_citations():
    from app.ai.assistant import normalize_citations as n
    assert n("A 【S1】.") == "A [S1]."
    assert n("A 【1†L3-L5】.") == "A [S1]."              # line ranges are not source numbers
    assert n("A 【S1, S3】.") == "A [S1][S3]."           # several sources in one bracket
    assert n("A 【S2】【S4】.") == "A [S2][S4]."
    assert n("A 【source】.") == "A 【source】."           # no number: left untouched
    assert n("Plain [S2].") == "Plain [S2]."


def test_fullwidth_citations_in_evidence_are_normalized(monkeypatch):
    monkeypatch.setattr(assistant.retriever, "search", lambda q, k, accessions=None: [dict(c) for c in CHUNKS])
    monkeypatch.setattr(assistant.retriever, "mentioned_accessions", lambda q: [])
    monkeypatch.setattr(assistant, "complete_json", lambda s, u: ({
        "answer": "FLEX tested CO2 【S1, S2】.",
        "evidence": [{"statement": "CO2 tested 【1†L2-L4】", "sources": ["S1"]}],
        "interpretation": [], "limitations": [], "sufficient": True, "follow_up": []}, "m"))
    r = assistant.ask("fullwidth citations?")
    assert r["answer"] == "FLEX tested CO2 [S1][S2]." and not r["warnings"]
    assert r["evidence"][0]["statement"] == "CO2 tested [S1]"
