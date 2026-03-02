"""
Neurix CRM — Application Configuration
Loads settings from environment variables.
"""

from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # ── Application ──
    APP_NAME: str = "Neurix CRM"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    CORS_ORIGINS: str = "*"  # Comma-separated origins in production

    # ── Supabase ──
    SUPABASE_URL: str = ""
    SUPABASE_ANON_KEY: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""
    SUPABASE_JWT_SECRET: str = ""

    # ── Redis ──
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    REDIS_PASSWORD: str = ""
    REDIS_DB: int = 0

    # ── Auth ──
    SESSION_DURATION_DAYS: int = 14
    TWO_FACTOR_ENABLED: bool = True

    # ── Uazapi (WhatsApp) ──
    UAZAPI_URL: str = ""
    UAZAPI_ADMIN_TOKEN: str = ""  # For /instance/all and admin endpoints
    UAZAPI_INSTANCE_TOKEN: str = ""  # For /send/* endpoints (per-instance)
    UAZAPI_WEBHOOK_SECRET: str = ""  # URL-based secret for webhook validation

    # ── SMTP (for Supabase Auth 2FA emails) ──
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASS: str = ""

    @property
    def redis_url(self) -> str:
        if self.REDIS_PASSWORD:
            return f"redis://default:{self.REDIS_PASSWORD}@{self.REDIS_HOST}:{self.REDIS_PORT}/{self.REDIS_DB}"
        return f"redis://{self.REDIS_HOST}:{self.REDIS_PORT}/{self.REDIS_DB}"

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",")]

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


@lru_cache
def get_settings() -> Settings:
    return Settings()
