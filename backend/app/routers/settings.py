"""
Settings Router — User preferences, modules, integrations.
Maps to the Configurações page.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from supabase import Client as SupabaseClient
from typing import Optional, Any

from app.dependencies import get_supabase, get_current_user

router = APIRouter()


class SettingUpdate(BaseModel):
    key: str
    value: Any


class SettingResponse(BaseModel):
    key: str
    value: Any


@router.get("/", response_model=list[SettingResponse])
async def list_settings(
    user=Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_supabase),
):
    """Get all user settings."""
    response = supabase.table("settings") \
        .select("key, value") \
        .eq("tenant_id", user.id) \
        .execute()
    return [SettingResponse(**row) for row in (response.data or [])]


@router.get("/{key}", response_model=SettingResponse)
async def get_setting(
    key: str,
    user=Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_supabase),
):
    """Get a specific setting by key."""
    response = supabase.table("settings") \
        .select("key, value") \
        .eq("tenant_id", user.id) \
        .eq("key", key) \
        .single() \
        .execute()

    if not response.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Configuração não encontrada.")

    return SettingResponse(**response.data)


@router.put("/{key}", response_model=SettingResponse)
async def upsert_setting(
    key: str,
    payload: SettingUpdate,
    user=Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_supabase),
):
    """Create or update a setting."""
    data = {
        "key": key,
        "value": payload.value,
        "tenant_id": user.id,
    }

    response = supabase.table("settings") \
        .upsert(data, on_conflict="tenant_id,key") \
        .execute()

    if not response.data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Erro ao salvar configuração.")

    return SettingResponse(**response.data[0])
