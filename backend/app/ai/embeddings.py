"""Embedding providers for the RAG index.

EMBEDDING_PROVIDER=google  (default)  Gemini API embedding models
    gemini-embedding-001 : text-only; task_type RETRIEVAL_DOCUMENT / RETRIEVAL_QUERY;
                           a list of strings returns one embedding per string.
    gemini-embedding-2   : no task_type field; the task goes in the text
                           ("task: search result | query: ..." / "title: ... | text: ...");
                           each input must be wrapped in its own Content to get separate embeddings.
    Output size set with EMBEDDING_DIM (128-3072; recommended 768, 1536 or 3072).
EMBEDDING_PROVIDER=local   fastembed BAAI/bge-small-en-v1.5 on CPU (384 dims, no key)

All vectors are L2-normalized here so FAISS inner product == cosine similarity
(gemini-embedding-001 does not normalize truncated dimensions by itself).

The SAME provider/model/dimension must be used to build the index and to embed
queries; signature() is stored in the index manifest and checked at load time.
"""
from __future__ import annotations

import time
from collections.abc import Callable, Sequence
from functools import lru_cache

import numpy as np

from app.core.config import get_settings

BGE_QUERY_PREFIX = "Represent this sentence for searching relevant passages: "


def signature() -> dict:
    s = get_settings()
    if s.embedding_provider == "local":
        return {"provider": "local", "model": s.local_embedding_model, "dim": 384}
    return {"provider": "google", "model": s.embedding_model, "dim": s.embedding_dim}


def _normalize(m: np.ndarray) -> np.ndarray:
    return m / np.clip(np.linalg.norm(m, axis=1, keepdims=True), 1e-12, None)


# ----------------------------------------------------------------------------- local
@lru_cache
def _local_model():
    from fastembed import TextEmbedding

    s = get_settings()
    return TextEmbedding(s.local_embedding_model, cache_dir=str(s.data_dir / "processed" / "models"))


# ----------------------------------------------------------------------------- google
@lru_cache
def _google_client():
    from google import genai

    key = get_settings().gemini_api_key
    if not key:
        raise RuntimeError("GEMINI_API_KEY is not set (add it to .env or the environment).")
    return genai.Client(api_key=key)


def _with_retries(fn: Callable[[], np.ndarray]) -> np.ndarray:
    """Retry on rate limits / transient server errors with exponential backoff."""
    tries = get_settings().embed_max_retries
    for attempt in range(1, tries + 1):
        try:
            return fn()
        except Exception as exc:  # noqa: BLE001 - SDK raises google.genai.errors.APIError subclasses
            code = getattr(exc, "code", None)
            retriable = code in (429, 500, 502, 503, 504) or "RESOURCE_EXHAUSTED" in str(exc)
            if not retriable or attempt == tries:
                raise
            wait = min(90, 2 ** attempt)
            print(f"  embedding API error ({code}); retry {attempt}/{tries - 1} in {wait}s", flush=True)
            time.sleep(wait)
    raise RuntimeError("unreachable")


def _google_embed(texts: Sequence[str], task: str) -> np.ndarray:
    from google.genai import types

    s = get_settings()
    client = _google_client()
    if s.embedding_model.startswith("gemini-embedding-2"):
        contents = [types.Content(parts=[types.Part.from_text(text=t)]) for t in texts]
        config = types.EmbedContentConfig(output_dimensionality=s.embedding_dim)
    else:
        contents = list(texts)
        config = types.EmbedContentConfig(task_type=task, output_dimensionality=s.embedding_dim)

    def call() -> np.ndarray:
        res = client.models.embed_content(model=s.embedding_model, contents=contents, config=config)
        vecs = np.array([e.values for e in res.embeddings], dtype="float32")
        if vecs.shape[0] != len(texts):
            raise RuntimeError(f"Expected {len(texts)} embeddings, got {vecs.shape[0]}")
        return vecs

    return _with_retries(call)


def _format_document(title: str, text: str) -> str:
    s = get_settings()
    if s.embedding_provider == "google" and s.embedding_model.startswith("gemini-embedding-2"):
        return f"title: {title or 'none'} | text: {text}"
    return f"{title}\n{text}"


def _format_query(text: str) -> str:
    s = get_settings()
    if s.embedding_provider == "local":
        return BGE_QUERY_PREFIX + text
    if s.embedding_model.startswith("gemini-embedding-2"):
        return f"task: question answering | query: {text}"
    return text


# ----------------------------------------------------------------------------- public API
def embed_documents(items: Sequence[tuple[str, str]]) -> np.ndarray:
    """Embed (title, text) pairs for indexing. Returns L2-normalized float32 [n, dim]."""
    texts = [_format_document(t, x) for t, x in items]
    s = get_settings()
    if s.embedding_provider == "local":
        vecs = np.array(list(_local_model().embed(texts, batch_size=64)), dtype="float32")
    else:
        vecs = _google_embed(texts, "RETRIEVAL_DOCUMENT")
    return _normalize(vecs)


def embed_query(text: str) -> np.ndarray:
    s = get_settings()
    q = _format_query(text)
    if s.embedding_provider == "local":
        vecs = np.array(list(_local_model().embed([q])), dtype="float32")
    else:
        vecs = _google_embed([q], "QUESTION_ANSWERING")  # task_type ignored for gemini-embedding-2
    return _normalize(vecs)
