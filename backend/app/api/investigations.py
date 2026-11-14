from fastapi import APIRouter, HTTPException, Query

from app.schemas.investigations import InvestigationDetail, InvestigationSummary, Stats, TestPage
from app.services import investigations as svc

router = APIRouter(prefix="/api", tags=["catalogue"])


@router.get("/stats", response_model=Stats)
def get_stats():
    return svc.stats()


@router.get("/investigations", response_model=list[InvestigationSummary])
def list_investigations(
    q: str | None = None,
    fuel_phase: str | None = Query(None, description="solid | liquid | gas | aerosol"),
    role: str | None = Query(None, description="prevention | detection | suppression | fundamental | modeling"),
    project_type: str | None = None,
    has_tests: bool | None = None,
    sort: str = Query("relevance", pattern="^(relevance|name|tests|publications|date)$"),
):
    return svc.list_investigations(q, fuel_phase, role, project_type, has_tests, sort)


@router.get("/investigations/{accession}", response_model=InvestigationDetail)
def get_investigation(accession: str):
    inv = svc.get_investigation(accession.upper())
    if not inv:
        raise HTTPException(404, f"Investigation {accession} not found")
    return inv


@router.get("/investigations/{accession}/tests", response_model=TestPage)
def get_tests(accession: str, table: str | None = None,
              limit: int = Query(100, ge=1, le=2000), offset: int = Query(0, ge=0)):
    return svc.get_tests(accession.upper(), table, limit, offset)


@router.get("/variables")
def get_variables():
    return svc.variables()


@router.get("/scenarios")
def get_scenarios():
    return svc.scenarios()


@router.get("/compare")
def compare(ids: str = Query(..., description="Comma-separated accessions, 2 to 4")):
    from app.services.compare import compare as run_compare

    accs = list(dict.fromkeys(a.strip().upper() for a in ids.split(",") if a.strip()))
    if not 2 <= len(accs) <= 4:
        raise HTTPException(400, "Select between 2 and 4 investigations")
    try:
        return run_compare(accs)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
