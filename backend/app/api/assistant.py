from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from app.ai import assistant, retriever
from app.ai.embeddings import signature
from app.core.config import ROOT, get_settings

router = APIRouter(prefix="/api", tags=["assistant"])


class AskRequest(BaseModel):
    question: str = Field(min_length=3, max_length=1000)
    accessions: list[str] | None = None
    k: int = Field(8, ge=3, le=14)


@router.get("/assistant/status")
def status():
    s = get_settings()
    gemini = s.llm_provider == "gemini"
    sig = signature()
    return {"llm_provider": s.llm_provider, "llm_model": s.gemini_model if gemini else s.groq_model,
            "llm_configured": bool(s.gemini_api_key if gemini else s.groq_api_key),
            "embedding_model": f"{sig['model']} ({sig['provider']}, {sig['dim']}d)", "index": retriever.index_info()}


@router.post("/assistant/ask")
def ask(req: AskRequest):
    try:
        return assistant.ask(req.question, req.accessions, req.k)
    except RuntimeError as exc:
        raise HTTPException(503, str(exc)) from exc


@router.get("/assistant/search")
def search(q: str, k: int = 8):
    """Retrieval only — useful for debugging and for the 'sources' panel."""
    return [{k_: v for k_, v in c.items() if k_ != "local_path"} for c in retriever.search(q, k)]


@router.get("/documents/{chunk_id}")
def document(chunk_id: int):
    """Serve the local copy of a NASA PDF (open at the cited page with #page=N)."""
    _, chunks = retriever._load()
    if chunk_id < 0 or chunk_id >= len(chunks) or not chunks[chunk_id].get("local_path"):
        raise HTTPException(404, "No local file for this source")
    path = (ROOT / chunks[chunk_id]["local_path"]).resolve()
    raw = (ROOT / "data" / "raw").resolve()
    if raw not in path.parents or not path.exists():
        raise HTTPException(404, "File not available locally — use the PSI link")
    return FileResponse(path, media_type="application/pdf", filename=Path(path).name,
                        content_disposition_type="inline")
