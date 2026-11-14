from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    """All settings come from environment variables or the project-root .env file (never hard-coded keys)."""

    model_config = SettingsConfigDict(env_file=str(ROOT / ".env"), env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Flame Intelligence API"
    data_dir: Path = ROOT / "data"
    db_path: Path = ROOT / "data" / "processed" / "flame.db"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # --- Generative model (answers) ------------------------------------------
    llm_provider: str = "gemini"                  # gemini | groq
    gemini_api_key: str | None = None             # env: GEMINI_API_KEY
    gemini_model: str = "gemini-3.8-flash"
    gemini_thinking_level: str | None = None      # low | medium | high (empty = model default)
    groq_api_key: str | None = None               # env: GROQ_API_KEY (legacy option)
    groq_model: str = "llama-3.3-70b-versatile"

    # --- Embeddings (retrieval) -------------------------------------------------
    embedding_provider: str = "google"            # google | local
    embedding_model: str = "gemini-embedding-001"  # google: gemini-embedding-001 | gemini-embedding-2
    embedding_dim: int = 768                      # google only: 128-3072 (recommended 768/1536/3072)
    local_embedding_model: str = "BAAI/bge-small-en-v1.5"  # used when embedding_provider=local (fixed 384 dims)
    embed_batch_size: int = 50
    embed_max_retries: int = 8

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
