from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.reports import build_report

router = APIRouter(prefix="/api", tags=["reports"])


class ReportRequest(BaseModel):
    question: str = Field(min_length=3, max_length=500)
    accessions: list[str] = Field(min_length=1, max_length=4)
    include_ai: bool = False


@router.post("/reports")
def create_report(req: ReportRequest):
    try:
        return build_report(req.question.strip(), [a.upper() for a in dict.fromkeys(req.accessions)], req.include_ai)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
