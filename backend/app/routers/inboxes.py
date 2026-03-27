"""
Caixas de entrada (inboxes) — CRUD (Sprint 7).

Regra: cada caixa tem exatamente um funil (`funnel_id NOT NULL`); validação de funil
pertencente ao mesmo `tenant_id` que o dono dos dados (`auth.users.id`).
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from supabase import Client as SupabaseClient

from app.authz import EffectiveRole, get_effective_role, require_org_admin
from app.dependencies import get_current_user, get_supabase
from app.models.inbox import InboxCreate, InboxResponse, InboxUpdate, inbox_response_from_row

router = APIRouter()


def _row_to_response(row: dict[str, Any]) -> InboxResponse:
    try:
        return inbox_response_from_row(row)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e)) from e


def _assert_funnel_owned_by_tenant(
    supabase: SupabaseClient,
    funnel_id: str,
    tenant_id: str,
) -> None:
    res = (
        supabase.table("funnels")
        .select("id, tenant_id")
        .eq("id", funnel_id)
        .limit(1)
        .execute()
    )
    rows = res.data or []
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Funil não encontrado.")
    if str(rows[0]["tenant_id"]) != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="O funil não pertence ao tenant.",
        )


def _get_inbox_for_user(
    supabase: SupabaseClient,
    inbox_id: str,
    user_id: str,
    eff: EffectiveRole,
) -> dict[str, Any]:
    res = supabase.table("inboxes").select("*").eq("id", inbox_id).limit(1).execute()
    rows = res.data or []
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Caixa de entrada não encontrada.")
    row = rows[0]
    tid = str(row["tenant_id"])
    if tid != user_id:
        if eff.is_read_only and eff.assigned_funnel_id and str(row.get("funnel_id")) == eff.assigned_funnel_id:
            return row
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso negado a esta caixa.")
    return row


def _get_inbox_mutable(supabase: SupabaseClient, inbox_id: str, user_id: str) -> dict[str, Any]:
    res = supabase.table("inboxes").select("*").eq("id", inbox_id).limit(1).execute()
    rows = res.data or []
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Caixa de entrada não encontrada.")
    row = rows[0]
    if str(row["tenant_id"]) != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso negado a esta caixa.")
    return row


@router.get("/", response_model=list[InboxResponse])
async def list_inboxes(
    tenant_id: Optional[str] = Query(None, description="Superadmin: filtrar por tenant (auth.users.id)."),
    user=Depends(get_current_user),
    eff: EffectiveRole = Depends(get_effective_role),
    supabase: SupabaseClient = Depends(get_supabase),
):
    """Lista caixas de entrada. Tenant: só as do próprio usuário. Read-only: só do funil atribuído."""
    uid = str(user.id)

    if eff.is_superadmin and tenant_id:
        res = (
            supabase.table("inboxes")
            .select("*")
            .eq("tenant_id", tenant_id)
            .order("created_at", desc=False)
            .execute()
        )
        return [_row_to_response(r) for r in (res.data or [])]

    if eff.is_read_only and eff.assigned_funnel_id:
        res = (
            supabase.table("inboxes")
            .select("*")
            .eq("funnel_id", eff.assigned_funnel_id)
            .order("created_at", desc=False)
            .execute()
        )
        return [_row_to_response(r) for r in (res.data or [])]

    res = (
        supabase.table("inboxes")
        .select("*")
        .eq("tenant_id", uid)
        .order("created_at", desc=False)
        .execute()
    )
    return [_row_to_response(r) for r in (res.data or [])]


@router.get("/{inbox_id}", response_model=InboxResponse)
async def get_inbox(
    inbox_id: str,
    user=Depends(get_current_user),
    eff: EffectiveRole = Depends(get_effective_role),
    supabase: SupabaseClient = Depends(get_supabase),
):
    row = _get_inbox_for_user(supabase, inbox_id, str(user.id), eff)
    return _row_to_response(row)


@router.post("/", response_model=InboxResponse, status_code=status.HTTP_201_CREATED)
async def create_inbox(
    body: InboxCreate,
    user=Depends(get_current_user),
    _admin: EffectiveRole = Depends(require_org_admin),
    supabase: SupabaseClient = Depends(get_supabase),
):
    """Cria caixa com um funil obrigatório."""
    uid = str(user.id)
    _assert_funnel_owned_by_tenant(supabase, body.funnel_id, uid)

    now = datetime.now(timezone.utc).isoformat()
    insert_payload = {
        "tenant_id": uid,
        "funnel_id": body.funnel_id,
        "name": body.name.strip(),
        "uazapi_settings": body.uazapi_settings or {},
        "created_at": now,
        "updated_at": now,
    }
    res = supabase.table("inboxes").insert(insert_payload).execute()
    rows = res.data or []
    if not rows:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Falha ao criar inbox.")
    return _row_to_response(rows[0])


@router.patch("/{inbox_id}", response_model=InboxResponse)
async def update_inbox(
    inbox_id: str,
    body: InboxUpdate,
    user=Depends(get_current_user),
    _admin: EffectiveRole = Depends(require_org_admin),
    supabase: SupabaseClient = Depends(get_supabase),
):
    uid = str(user.id)
    existing = _get_inbox_mutable(supabase, inbox_id, uid)
    new_funnel = body.funnel_id if body.funnel_id is not None else str(existing["funnel_id"])
    _assert_funnel_owned_by_tenant(supabase, new_funnel, uid)

    patch: dict[str, Any] = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if body.name is not None:
        patch["name"] = body.name.strip()
    if body.funnel_id is not None:
        patch["funnel_id"] = body.funnel_id
    if body.uazapi_settings is not None:
        merged = dict(existing.get("uazapi_settings") or {})
        merged.update(body.uazapi_settings)
        patch["uazapi_settings"] = merged

    if len(patch) <= 1 and body.uazapi_settings is None:
        return _row_to_response(existing)

    res = supabase.table("inboxes").update(patch).eq("id", inbox_id).eq("tenant_id", uid).execute()
    rows = res.data or []
    if not rows:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Falha ao atualizar inbox.")
    return _row_to_response(rows[0])


@router.delete("/{inbox_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_inbox(
    inbox_id: str,
    user=Depends(get_current_user),
    _admin: EffectiveRole = Depends(require_org_admin),
    supabase: SupabaseClient = Depends(get_supabase),
):
    uid = str(user.id)
    _get_inbox_mutable(supabase, inbox_id, uid)
    supabase.table("inboxes").delete().eq("id", inbox_id).eq("tenant_id", uid).execute()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
