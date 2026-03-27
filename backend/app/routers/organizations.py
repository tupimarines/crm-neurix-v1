"""
Organizações e membros — CRUD (Sprint 3).

Autorização:
- **Superadmin**: cria/remove organizações; acesso total a orgs e membros.
- **Admin da organização** (`organization_members.role = admin`): atualiza nome da própria org;
  adiciona/remove/atualiza membros dessa org.
- **Read-only** e demais: apenas leitura da(s) organização(ões) onde é membro (GET).
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from supabase import Client as SupabaseClient

from app.authz import EffectiveRole, get_effective_role
from app.dependencies import get_current_user, get_supabase, require_superadmin
from app.org_scope import assert_funnel_assignable_to_org, list_funnels_for_organization
from app.models.organization import (
    OrganizationCreate,
    OrganizationFunnelItem,
    OrganizationMemberCreate,
    OrganizationMemberResponse,
    OrganizationMemberUpdate,
    OrganizationResponse,
    OrganizationUpdate,
)

router = APIRouter()


def _parse_ts(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value
    if value is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Timestamp ausente.")
    return datetime.fromisoformat(str(value).replace("Z", "+00:00"))


def _membership_for_org(
    supabase: SupabaseClient,
    user_id: str,
    org_id: str,
) -> Optional[dict[str, Any]]:
    res = (
        supabase.table("organization_members")
        .select("id, organization_id, user_id, role, assigned_funnel_id, created_at")
        .eq("organization_id", org_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    rows = res.data or []
    return rows[0] if rows else None


def _is_superadmin(eff: EffectiveRole) -> bool:
    return eff.is_superadmin


def _can_manage_org(eff: EffectiveRole, membership: Optional[dict[str, Any]]) -> bool:
    if _is_superadmin(eff):
        return True
    if membership and membership.get("role") == "admin":
        return True
    return False


def _can_read_org(eff: EffectiveRole, membership: Optional[dict[str, Any]]) -> bool:
    if _is_superadmin(eff):
        return True
    return membership is not None


def _org_row_to_response(row: dict[str, Any]) -> OrganizationResponse:
    return OrganizationResponse(
        id=str(row["id"]),
        name=row["name"],
        created_at=_parse_ts(row.get("created_at")),
        updated_at=_parse_ts(row.get("updated_at")),
    )


def _member_row_to_response(row: dict[str, Any]) -> OrganizationMemberResponse:
    af = row.get("assigned_funnel_id")
    return OrganizationMemberResponse(
        id=str(row["id"]),
        organization_id=str(row["organization_id"]),
        user_id=str(row["user_id"]),
        role=row["role"],
        assigned_funnel_id=str(af) if af is not None else None,
        created_at=_parse_ts(row.get("created_at")),
    )


@router.post("/", response_model=OrganizationResponse, status_code=status.HTTP_201_CREATED)
async def create_organization(
    payload: OrganizationCreate,
    _sa: EffectiveRole = Depends(require_superadmin),
    supabase: SupabaseClient = Depends(get_supabase),
):
    """Cria organização (somente superadmin)."""
    now = datetime.now(timezone.utc).isoformat()
    ins = (
        supabase.table("organizations")
        .insert({"name": payload.name.strip(), "updated_at": now})
        .execute()
    )
    rows = ins.data or []
    if not rows:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Falha ao criar organização.")
    return _org_row_to_response(rows[0])


@router.get("/", response_model=list[OrganizationResponse])
async def list_organizations(
    user=Depends(get_current_user),
    eff: EffectiveRole = Depends(get_effective_role),
    supabase: SupabaseClient = Depends(get_supabase),
):
    """Lista organizações: todas para superadmin; apenas as que o usuário integra, caso contrário."""
    uid = str(user.id)
    if _is_superadmin(eff):
        res = (
            supabase.table("organizations")
            .select("id, name, created_at, updated_at")
            .order("name")
            .execute()
        )
        rows = res.data or []
        return [_org_row_to_response(r) for r in rows]

    mres = (
        supabase.table("organization_members")
        .select("organization_id")
        .eq("user_id", uid)
        .execute()
    )
    org_ids = [str(r["organization_id"]) for r in (mres.data or [])]
    if not org_ids:
        return []

    res = (
        supabase.table("organizations")
        .select("id, name, created_at, updated_at")
        .in_("id", org_ids)
        .order("name")
        .execute()
    )
    rows = res.data or []
    return [_org_row_to_response(r) for r in rows]


@router.get("/{org_id}", response_model=OrganizationResponse)
async def get_organization(
    org_id: str,
    user=Depends(get_current_user),
    eff: EffectiveRole = Depends(get_effective_role),
    supabase: SupabaseClient = Depends(get_supabase),
):
    uid = str(user.id)
    membership = _membership_for_org(supabase, uid, org_id)
    if not _can_read_org(eff, membership):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sem acesso a esta organização.")

    res = (
        supabase.table("organizations")
        .select("id, name, created_at, updated_at")
        .eq("id", org_id)
        .limit(1)
        .execute()
    )
    rows = res.data or []
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organização não encontrada.")
    return _org_row_to_response(rows[0])


@router.patch("/{org_id}", response_model=OrganizationResponse)
async def update_organization(
    org_id: str,
    payload: OrganizationUpdate,
    user=Depends(get_current_user),
    eff: EffectiveRole = Depends(get_effective_role),
    supabase: SupabaseClient = Depends(get_supabase),
):
    uid = str(user.id)
    membership = _membership_for_org(supabase, uid, org_id)
    if not _can_manage_org(eff, membership):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sem permissão para alterar esta organização.",
        )

    now = datetime.now(timezone.utc).isoformat()
    upd = (
        supabase.table("organizations")
        .update({"name": payload.name.strip(), "updated_at": now})
        .eq("id", org_id)
        .execute()
    )
    rows = upd.data or []
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organização não encontrada.")
    return _org_row_to_response(rows[0])


@router.delete("/{org_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_organization(
    org_id: str,
    _sa: EffectiveRole = Depends(require_superadmin),
    supabase: SupabaseClient = Depends(get_supabase),
):
    """Remove organização (somente superadmin). CASCADE remove membros."""
    check = supabase.table("organizations").select("id").eq("id", org_id).limit(1).execute()
    if not (check.data or []):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organização não encontrada.")
    supabase.table("organizations").delete().eq("id", org_id).execute()
    return None


@router.get("/{org_id}/members", response_model=list[OrganizationMemberResponse])
async def list_members(
    org_id: str,
    user=Depends(get_current_user),
    eff: EffectiveRole = Depends(get_effective_role),
    supabase: SupabaseClient = Depends(get_supabase),
):
    uid = str(user.id)
    membership = _membership_for_org(supabase, uid, org_id)
    if not _can_read_org(eff, membership):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sem acesso a esta organização.")

    res = (
        supabase.table("organization_members")
        .select("id, organization_id, user_id, role, assigned_funnel_id, created_at")
        .eq("organization_id", org_id)
        .order("created_at")
        .execute()
    )
    rows = res.data or []
    return [_member_row_to_response(r) for r in rows]


@router.get("/{org_id}/funnels", response_model=list[OrganizationFunnelItem])
async def list_organization_funnels(
    org_id: str,
    user=Depends(get_current_user),
    eff: EffectiveRole = Depends(get_effective_role),
    supabase: SupabaseClient = Depends(get_supabase),
):
    """Funis dos tenants admin da organização (dropdown assigned_funnel_id, console)."""
    uid = str(user.id)
    membership = _membership_for_org(supabase, uid, org_id)
    if not _can_read_org(eff, membership):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sem acesso a esta organização.")

    org_check = supabase.table("organizations").select("id").eq("id", org_id).limit(1).execute()
    if not (org_check.data or []):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organização não encontrada.")

    raw = list_funnels_for_organization(supabase, org_id)
    out: list[OrganizationFunnelItem] = []
    for r in raw:
        out.append(
            OrganizationFunnelItem(
                id=str(r["id"]),
                tenant_id=str(r["tenant_id"]),
                name=str(r["name"]),
                created_at=_parse_ts(r.get("created_at")),
                updated_at=_parse_ts(r.get("updated_at")),
            )
        )
    return out


@router.post("/{org_id}/members", response_model=OrganizationMemberResponse, status_code=status.HTTP_201_CREATED)
async def add_member(
    org_id: str,
    payload: OrganizationMemberCreate,
    user=Depends(get_current_user),
    eff: EffectiveRole = Depends(get_effective_role),
    supabase: SupabaseClient = Depends(get_supabase),
):
    uid = str(user.id)
    membership = _membership_for_org(supabase, uid, org_id)
    if not _can_manage_org(eff, membership):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sem permissão para gerir membros desta organização.",
        )

    ocheck = supabase.table("organizations").select("id").eq("id", org_id).limit(1).execute()
    if not (ocheck.data or []):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organização não encontrada.")

    if payload.role == "read_only":
        assert payload.assigned_funnel_id
        try:
            assert_funnel_assignable_to_org(supabase, org_id, payload.assigned_funnel_id)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    row: dict[str, Any] = {
        "organization_id": org_id,
        "user_id": payload.user_id,
        "role": payload.role,
        "assigned_funnel_id": payload.assigned_funnel_id if payload.role == "read_only" else None,
    }

    try:
        ins = supabase.table("organization_members").insert(row).execute()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Não foi possível adicionar membro: {exc!s}",
        ) from exc
    rows = ins.data or []
    if not rows:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Não foi possível adicionar membro.")
    return _member_row_to_response(rows[0])


@router.patch("/{org_id}/members/{member_user_id}", response_model=OrganizationMemberResponse)
async def update_member(
    org_id: str,
    member_user_id: str,
    payload: OrganizationMemberUpdate,
    user=Depends(get_current_user),
    eff: EffectiveRole = Depends(get_effective_role),
    supabase: SupabaseClient = Depends(get_supabase),
):
    uid = str(user.id)
    membership = _membership_for_org(supabase, uid, org_id)
    if not _can_manage_org(eff, membership):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sem permissão para gerir membros desta organização.",
        )

    if payload.role is None and payload.assigned_funnel_id is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Informe role e/ou assigned_funnel_id.",
        )

    cur = (
        supabase.table("organization_members")
        .select("role, assigned_funnel_id")
        .eq("organization_id", org_id)
        .eq("user_id", member_user_id)
        .limit(1)
        .execute()
    )
    cur_rows = cur.data or []
    if not cur_rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Membro não encontrado.")
    current = cur_rows[0]

    final_role = payload.role if payload.role is not None else current["role"]
    if final_role == "admin":
        final_funnel = None
    else:
        final_funnel = (
            payload.assigned_funnel_id
            if payload.assigned_funnel_id is not None
            else current.get("assigned_funnel_id")
        )
        if not final_funnel:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="assigned_funnel_id é obrigatório para read_only.",
            )
        try:
            assert_funnel_assignable_to_org(supabase, org_id, str(final_funnel))
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    patch: dict[str, Any] = {"role": final_role, "assigned_funnel_id": final_funnel}

    upd = (
        supabase.table("organization_members")
        .update(patch)
        .eq("organization_id", org_id)
        .eq("user_id", member_user_id)
        .execute()
    )
    rows = upd.data or []
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Membro não encontrado.")
    return _member_row_to_response(rows[0])


@router.delete("/{org_id}/members/{member_user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    org_id: str,
    member_user_id: str,
    user=Depends(get_current_user),
    eff: EffectiveRole = Depends(get_effective_role),
    supabase: SupabaseClient = Depends(get_supabase),
):
    uid = str(user.id)
    membership = _membership_for_org(supabase, uid, org_id)
    if not _can_manage_org(eff, membership):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sem permissão para gerir membros desta organização.",
        )

    check = (
        supabase.table("organization_members")
        .select("id")
        .eq("organization_id", org_id)
        .eq("user_id", member_user_id)
        .limit(1)
        .execute()
    )
    if not (check.data or []):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Membro não encontrado.")
    supabase.table("organization_members").delete().eq("organization_id", org_id).eq("user_id", member_user_id).execute()
    return None
