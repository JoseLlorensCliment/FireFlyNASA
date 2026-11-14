from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import assistant, insights, investigations, reports
from app.core.config import get_settings

settings = get_settings()
app = FastAPI(title=settings.app_name, version="0.1.0",
              description="Microgravity combustion research explorer built on NASA PSI data.")
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_list, allow_methods=["*"], allow_headers=["*"])
app.include_router(investigations.router)
app.include_router(assistant.router)
app.include_router(insights.router)
app.include_router(reports.router)


@app.get("/api/health")
def health():
    return {"status": "ok", "db": settings.db_path.exists()}
