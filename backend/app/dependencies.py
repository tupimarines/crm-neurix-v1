"""
Neurix CRM — Dependency Injection
Provides Supabase client, Redis client, and auth dependencies.

NOTE: The backend uses a SERVICE ROLE client for all database operations.
This bypasses RLS — the backend is responsible for enforcing tenant isolation
by filtering queries on tenant_id after validating the user's JWT.
"""

import json
from datetime import datetime, timezone
from pathlib import Path

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import redis.asyncio as aioredis
from supabase import create_client, Client as SupabaseClient

from app.config import get_settings, Settings

security = HTTPBearer()

# ── Supabase Client (service role — bypasses RLS) ──

_supabase_client: SupabaseClient | None = None


# region agent log
def _debug_log(hypothesis_id: str, location: str, message: str, data: dict) -> None:
    try:
        payload = {
            "sessionId": "25dc31",
            "runId": "initial-debug",
            "hypothesisId": hypothesis_id,
            "location": location,
            "message": message,
            "data": data,
            "timestamp": int(datetime.now(timezone.utc).timestamp() * 1000),
        }
        with Path("debug-25dc31.log").open("a", encoding="utf-8") as fp:
            fp.write(json.dumps(payload, ensure_ascii=False) + "\n")
    except Exception:
        pass


# endregion


def get_supabase(settings: Settings = Depends(get_settings)) -> SupabaseClient:
    """Returns a Supabase client with SERVICE ROLE key (bypasses RLS).
    The backend validates auth via get_current_user() and enforces
    tenant isolation manually in each query."""
    global _supabase_client
    if _supabase_client is None:
        key = settings.SUPABASE_SERVICE_ROLE_KEY or settings.SUPABASE_ANON_KEY
        # region agent log
        _debug_log(
            "H5",
            "backend/app/dependencies.py:get_supabase",
            "Initializing Supabase client",
            {
                "has_supabase_url": bool(settings.SUPABASE_URL),
                "key_mode": "service_role" if bool(settings.SUPABASE_SERVICE_ROLE_KEY) else "anon_fallback",
                "has_key": bool(key),
            },
        )
        # endregion
        if not settings.SUPABASE_URL or not key:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Supabase not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
            )
        try:
            _supabase_client = create_client(settings.SUPABASE_URL, key)
        except Exception as exc:
            # region agent log
            _debug_log(
                "H5",
                "backend/app/dependencies.py:get_supabase",
                "Failed to create Supabase client",
                {
                    "error_type": type(exc).__name__,
                    "error": str(exc),
                },
            )
            # endregion
            raise
    return _supabase_client


# Keep get_supabase_admin as alias for backward compat (upload.py uses it)
def get_supabase_admin(settings: Settings = Depends(get_settings)) -> SupabaseClient:
    """Alias for get_supabase — both now use service role key."""
    return get_supabase(settings)


# ── Redis Client ──

_redis_pool: aioredis.Redis | None = None


async def get_redis(settings: Settings = Depends(get_settings)) -> aioredis.Redis:
    """Returns an async Redis connection."""
    global _redis_pool
    if _redis_pool is None:
        _redis_pool = aioredis.from_url(
            settings.redis_url,
            decode_responses=True,
        )
    return _redis_pool


# ── Auth Dependency ──

# We need a separate anon-key client just for auth.get_user() token validation
_supabase_auth_client: SupabaseClient | None = None


def _get_auth_client(settings: Settings = Depends(get_settings)) -> SupabaseClient:
    """Returns a Supabase client with ANON key for auth validation only."""
    global _supabase_auth_client
    if _supabase_auth_client is None:
        if not settings.SUPABASE_URL or not settings.SUPABASE_ANON_KEY:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Supabase not configured.",
            )
        _supabase_auth_client = create_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY)
    return _supabase_auth_client


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    supabase: SupabaseClient = Depends(_get_auth_client),
):
    """Validates the JWT token from Supabase Auth and returns the user."""
    token = credentials.credentials
    try:
        user_response = supabase.auth.get_user(token)
        if not user_response or not user_response.user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token inválido ou expirado.",
            )
        return user_response.user
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Falha na autenticação: {str(e)}",
        )
