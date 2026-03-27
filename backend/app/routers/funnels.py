"""
Funis do tenant — listagem para UI (Configurações / caixas de entrada).

Apenas funis com `funnels.tenant_id` = usuário autenticado (dono dos dados).
"""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from supabase import Client as SupabaseClient

from app.authz import EffectiveRole, get_effective_role, require_org_admin
from app.dependencies import get_current_user, get_supabase

router = APIRouter()


def _parse_ts(value: object) -> datetime:
    if isinstance(value, datetime):
        return value
    if value is None:
        return datetime.now(timezone.utc)
    return datetime.fromisoformat(str(value).replace("Z", "+00:00"))


class FunnelListItem(BaseModel):
    id: str
    tenant_id: str
    name: str
    created_at: datetime
    updated_at: datetime


class FunnelCreatePayload(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)


@router.get("/", response_model=list[FunnelListItem])
async def list_my_funnels(
    user=Depends(get_current_user),
    _eff: EffectiveRole = Depends(get_effective_role),
    supabase: SupabaseClient = Depends(get_supabase),
):
    """Lista funis cujo `tenant_id` é o usuário atual (criação de inbox exige funil próprio)."""
    uid = str(user.id)
    res = (
        supabase.table("funnels")
        .select("id, tenant_id, name, created_at, updated_at")
        .eq("tenant_id", uid)
        .order("created_at", desc=False)
        .execute()
    )
    rows = res.data or []
    out: list[FunnelListItem] = []
    for r in rows:
        out.append(
            FunnelListItem(
                id=str(r["id"]),
                tenant_id=str(r["tenant_id"]),
                name=str(r["name"]),
                created_at=_parse_ts(r.get("created_at")),
                updated_at=_parse_ts(r.get("updated_at")),
            )
        )
    return out


@router.post("/", response_model=FunnelListItem, status_code=status.HTTP_201_CREATED)
async def create_funnel(
    payload: FunnelCreatePayload,
    user=Depends(get_current_user),
    _admin: EffectiveRole = Depends(require_org_admin),
    supabase: SupabaseClient = Depends(get_supabase),
):
    """Cria funil próprio do admin autenticado."""
    now = datetime.now(timezone.utc).isoformat()
    insert_payload = {
        "id": str(uuid4()),
        "tenant_id": str(user.id),
        "name": payload.name.strip(),
        "created_at": now,
        "updated_at": now,
    }
    res = supabase.table("funnels").insert(insert_payload).execute()
    rows = res.data or []
    if not rows:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Falha ao criar funil.")
    row = rows[0]
    return FunnelListItem(
        id=str(row["id"]),
        tenant_id=str(row["tenant_id"]),
        name=str(row["name"]),
        created_at=_parse_ts(row.get("created_at")),
        updated_at=_parse_ts(row.get("updated_at")),
    )
