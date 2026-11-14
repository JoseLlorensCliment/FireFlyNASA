"""Light tests for the RAG build stages and the Gemini embedding wrapper.

No network, no API key and no PDF processing: PDFs are pointed at an empty folder,
the embedding API is replaced by a fake client.
"""
import json
import sys
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(ROOT / "pipeline"))

from app.ai import embeddings  # noqa: E402
from app.core.config import Settings  # noqa: E402


def _settings(**kw):
    base = dict(embedding_provider="google", embedding_model="gemini-embedding-001", embedding_dim=8,
                gemini_api_key="test-key", embed_batch_size=4, embed_max_retries=3)
    base.update(kw)
    return Settings(**base)


class FakeModels:
    def __init__(self, fail_first=0):
        self.calls = []
        self.fail_first = fail_first

    def embed_content(self, model, contents, config):
        self.calls.append((model, contents, config))
        if self.fail_first:
            self.fail_first -= 1
            raise type("APIError", (Exception,), {"code": 429})("RESOURCE_EXHAUSTED")
        n = len(contents)
        vals = [[float(i + 1)] * config.output_dimensionality for i in range(n)]
        return SimpleNamespace(embeddings=[SimpleNamespace(values=v) for v in vals])


@pytest.fixture
def fake_google(monkeypatch):
    def install(settings, fake):
        monkeypatch.setattr(embeddings, "get_settings", lambda: settings)
        monkeypatch.setattr(embeddings, "_google_client", lambda: SimpleNamespace(models=fake))
        monkeypatch.setattr(embeddings.time, "sleep", lambda s: None)
        return fake
    return install


def test_embedding_001_uses_task_type_and_normalizes(fake_google):
    fake = fake_google(_settings(), FakeModels())
    v = embeddings.embed_documents([("T1", "a"), ("T2", "b")])
    model, contents, config = fake.calls[0]
    assert model == "gemini-embedding-001" and contents == ["T1\na", "T2\nb"]
    assert config.task_type == "RETRIEVAL_DOCUMENT" and config.output_dimensionality == 8
    assert v.shape == (2, 8) and np.allclose(np.linalg.norm(v, axis=1), 1.0)
    embeddings.embed_query("q")
    assert fake.calls[-1][2].task_type == "QUESTION_ANSWERING"


def test_embedding_2_wraps_each_input_and_uses_prompt_format(fake_google):
    fake = fake_google(_settings(embedding_model="gemini-embedding-2"), FakeModels())
    embeddings.embed_documents([("Title", "body"), ("", "x")])
    _, contents, config = fake.calls[0]
    assert config.task_type is None
    assert [c.parts[0].text for c in contents] == ["title: Title | text: body", "title: none | text: x"]
    embeddings.embed_query("why?")
    assert fake.calls[-1][1][0].parts[0].text == "task: question answering | query: why?"


def test_rate_limit_is_retried(fake_google):
    fake = fake_google(_settings(), FakeModels(fail_first=2))
    v = embeddings.embed_documents([("t", "x")])
    assert v.shape == (1, 8) and len(fake.calls) == 3


def test_stages_are_resumable_and_record_signature(tmp_path, monkeypatch, fake_google):
    import build_rag_index as b

    settings = _settings()
    fake_google(settings, FakeModels())
    monkeypatch.setattr(b, "get_settings", lambda: settings)
    monkeypatch.setattr(b, "signature", lambda: {"provider": "google", "model": "gemini-embedding-001", "dim": 8})
    monkeypatch.setattr(b, "DOCS", tmp_path / "no_pdfs")       # skip PDF extraction (kept light)
    monkeypatch.setattr(b, "NASA_DOCS", tmp_path / "no_pdfs")
    out = tmp_path / "rag"

    b.stage_chunks(out, limit=10)
    chunks = [json.loads(line) for line in (out / "chunks.jsonl").open(encoding="utf-8")]
    assert len(chunks) == 10 and {"id", "doc_id", "title", "text", "source_type", "url", "accession"} <= set(chunks[0])

    b.stage_embed(out)
    parts = sorted(b.cache_dir(out).glob("part_*.npy"))
    assert len(parts) == 3                                     # 10 chunks / batch 4
    parts[-1].unlink()                                         # simulate an interruption
    calls_before = len(embeddings._google_client().models.calls)
    b.stage_embed(out)                                         # resumes: only the missing batch
    assert len(embeddings._google_client().models.calls) == calls_before + 1

    b.stage_index(out)
    manifest = json.loads((out / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["n_chunks"] == 10 and manifest["dim"] == 8
    assert manifest["embedding"] == {"provider": "google", "model": "gemini-embedding-001", "dim": 8}


def test_smoke_test_script_detects_missing_index_and_validates_built_one(tmp_path, monkeypatch, fake_google):
    import build_rag_index as b
    import rag_smoke_test as smoke
    from app.ai import retriever

    settings = _settings(data_dir=tmp_path)
    fake_google(settings, FakeModels())
    for mod in (b, smoke, retriever):
        monkeypatch.setattr(mod, "get_settings", lambda: settings)
    sig = {"provider": "google", "model": "gemini-embedding-001", "dim": 8}
    monkeypatch.setattr(b, "signature", lambda: sig)
    monkeypatch.setattr(b, "DOCS", tmp_path / "no_pdfs")
    monkeypatch.setattr(b, "NASA_DOCS", tmp_path / "no_pdfs")
    retriever._load.cache_clear()

    assert any("missing" in e for e in smoke.check_index())     # nothing built yet

    out = tmp_path / "processed" / "rag"
    b.stage_chunks(out, limit=12)
    b.stage_embed(out)
    b.stage_index(out)
    retriever._load.cache_clear()
    assert smoke.check_index() == []
    hits = retriever.search("anything", k=3)
    assert len(hits) == 3 and all("doc_id" in h for h in hits)

    # changing the embedding settings must be refused instead of silently mixing vector spaces
    settings.embedding_dim = 16
    retriever._load.cache_clear()
    assert any("embedding" in e for e in smoke.check_index())
    retriever._load.cache_clear()
