from fastapi import APIRouter

from app.services import insights as svc

router = APIRouter(prefix="/api/insights", tags=["safety insights"])


@router.get("/atmospheres")
def atmospheres():
    return svc.atmosphere_coverage()


@router.get("/flex-suppression")
def flex_suppression():
    return svc.flex_suppression()


@router.get("/saffire-gravity")
def saffire_gravity():
    return svc.saffire_ug_vs_1g()


@router.get("/bass2-products")
def bass2_products():
    return svc.bass2_products()


@router.get("/relevance")
def relevance():
    return svc.relevance_criteria()
