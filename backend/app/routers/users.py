"""
Usuários — criação/atualização via Supabase Auth Admin (service role, só backend).

Sprint 4: read_only exige assigned_funnel_id (funil da organização); telefones em profiles.phones.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from supabase import Client as SupabaseClient

from app.authz import EffectiveRole, get_effective_role
from app.dependencies import get_current_user, get_supabase
from app.models.user_management import (
    OrganizationUserCreate,
    OrganizationUserResponse,
    OrganizationUserUpdate,
    OrgMembershipPublic,
    UserDetailResponse,
)
from app.org_scope import assert_funnel_assignable_to_org

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


def _can_read_user(supabase: SupabaseClient, eff: EffectiveRole, uid: str, target_id: str) -> bool:
    if uid == target_id or _is_superadmin(eff):
        return True
    mine = supabase.table("organization_members").select("organization_id").eq("user_id", uid).execute()
    theirs = supabase.table("organization_members").select("organization_id").eq("user_id", target_id).execute()
    my_orgs = {str(r["organization_id"]) for r in (mine.data or [])}
    their_orgs = {str(r["organization_id"]) for r in (theirs.data or [])}
    return bool(my_orgs.intersection(their_orgs))


async def _load_profile_row(supabase: SupabaseClient, user_id: str) -> Optional[dict[str, Any]]:
    res = (
        supabase.table("profiles")
        .select("id, full_name, company_name, phones, created_at")
        .eq("id", user_id)
        .limit(1)
        .execute()
    )
    rows = res.data or []
    return rows[0] if rows else None


def _phones_from_row(row: Optional[dict[str, Any]]) -> list[str]:
    if not row:
        return []
    raw = row.get("phones")
    if raw is None:
        return []
    if isinstance(raw, list):
        return [str(x) for x in raw]
    return []


@router.post("/", response_model=OrganizationUserResponse, status_code=status.HTTP_201_CREATED)
async def create_organization_user(
    payload: OrganizationUserCreate,
    user=Depends(get_current_user),
    eff: EffectiveRole = Depends(get_effective_role),
    supabase: SupabaseClient = Depends(get_supabase),
):
    """
    Cria usuário em auth.users (Admin API), atualiza perfil e insere organization_members.
    Somente superadmin ou admin da organização.
    """
    uid = str(user.id)
    org_id = payload.organization_id
    membership = _membership_for_org(supabase, uid, org_id)
    if not _can_manage_org(eff, membership):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sem permissão para criar usuários nesta organização.")

    ocheck = supabase.table("organizations").select("id").eq("id", org_id).limit(1).execute()
    if not (ocheck.data or []):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organização não encontrada.")

    if payload.role == "read_only":
        assert payload.assigned_funnel_id
        try:
            assert_funnel_assignable_to_org(supabase, org_id, payload.assigned_funnel_id)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    try:
        auth_res = supabase.auth.admin.create_user(
            {
                "email": str(payload.email),
                "password": payload.password,
                "email_confirm": True,
                "user_metadata": {"full_name": payload.full_name.strip()},
            }
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Falha ao criar usuário (Auth): {exc!s}",
        ) from exc

    new_user = auth_res.user
    new_id = str(new_user.id)

    now = datetime.now(timezone.utc).isoformat()
    prof_patch: dict[str, Any] = {
        "full_name": payload.full_name.strip(),
        "organization_id": org_id,
        "updated_at": now,
    }
    if payload.company_name is not None:
        prof_patch["company_name"] = payload.company_name.strip()
    if payload.phones:
        prof_patch["phones"] = payload.phones

    supabase.table("profiles").update(prof_patch).eq("id", new_id).execute()

    mem_row: dict[str, Any] = {
        "organization_id": org_id,
        "user_id": new_id,
        "role": payload.role,
    }
    if payload.role == "read_only":
        mem_row["assigned_funnel_id"] = payload.assigned_funnel_id
    else:
        mem_row["assigned_funnel_id"] = None

    try:
        ins = supabase.table("organization_members").insert(mem_row).execute()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Usuário criado no Auth, mas falhou ao vincular à organização: {exc!s}",
        ) from exc
    rows = ins.data or []
    if not rows:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Falha ao inserir membro.")

    m = rows[0]
    prof = await _load_profile_row(supabase, new_id)
    return OrganizationUserResponse(
        id=new_id,
        email=str(payload.email),
        full_name=(prof or {}).get("full_name"),
        company_name=(prof or {}).get("company_name"),
        phones=_phones_from_row(prof),
        organization_id=org_id,
        role=m["role"],
        assigned_funnel_id=str(m["assigned_funnel_id"]) if m.get("assigned_funnel_id") else None,
        created_at=_parse_ts(m.get("created_at")),
    )


@router.get("/{user_id}", response_model=UserDetailResponse)
async def get_user_detail(
    user_id: str,
    user=Depends(get_current_user),
    eff: EffectiveRole = Depends(get_effective_role),
    supabase: SupabaseClient = Depends(get_supabase),
):
    """Perfil + memberships (telefones e funil para validação S4-T3)."""
    uid = str(user.id)
    if not _can_read_user(supabase, eff, uid, user_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sem permissão.")

    prof = await _load_profile_row(supabase, user_id)
    email_val: Optional[str] = None
    try:
        ures = supabase.auth.admin.get_user_by_id(user_id)
        email_val = ures.user.email
    except Exception:
        pass

    mres = (
        supabase.table("organization_members")
        .select("organization_id, role, assigned_funnel_id")
        .eq("user_id", user_id)
        .execute()
    )
    memberships: list[OrgMembershipPublic] = []
    for r in mres.data or []:
        af = r.get("assigned_funnel_id")
        memberships.append(
            OrgMembershipPublic(
                organization_id=str(r["organization_id"]),
                role=r["role"],
                assigned_funnel_id=str(af) if af is not None else None,
            )
        )

    return UserDetailResponse(
        id=user_id,
        email=email_val,
        full_name=(prof or {}).get("full_name"),
        company_name=(prof or {}).get("company_name"),
        phones=_phones_from_row(prof),
        memberships=memberships,
    )


@router.patch("/{user_id}", response_model=OrgMembershipPublic)
async def update_organization_user(
    user_id: str,
    payload: OrganizationUserUpdate,
    organization_id: str = Query(..., description="Organização cujo membro será atualizado."),
    user=Depends(get_current_user),
    eff: EffectiveRole = Depends(get_effective_role),
    supabase: SupabaseClient = Depends(get_supabase),
):
    """
    Atualiza perfil (nome, empresa, telefones) e/ou papel e funil na organização.
    """
    uid = str(user.id)
    membership_actor = _membership_for_org(supabase, uid, organization_id)
    if not _can_manage_org(eff, membership_actor):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sem permissão.")

    target = _membership_for_org(supabase, user_id, organization_id)
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Membro não encontrado nesta organização.")

    now = datetime.now(timezone.utc).isoformat()

    if payload.full_name is not None or payload.company_name is not None or payload.phones is not None:
        prof_patch: dict[str, Any] = {"updated_at": now}
        if payload.full_name is not None:
            prof_patch["full_name"] = payload.full_name.strip()
        if payload.company_name is not None:
            prof_patch["company_name"] = payload.company_name.strip()
        if payload.phones is not None:
            prof_patch["phones"] = payload.phones
        supabase.table("profiles").update(prof_patch).eq("id", user_id).execute()
        if payload.full_name is not None:
            try:
                supabase.auth.admin.update_user_by_id(
                    user_id,
                    {"user_metadata": {"full_name": payload.full_name.strip()}},
                )
            except Exception:
                pass

    membership_change = payload.role is not None or payload.assigned_funnel_id is not None
    if membership_change:
        final_role = payload.role if payload.role is not None else target["role"]
        if final_role == "admin":
            final_funnel_id = None
        else:
            final_funnel_id = (
                payload.assigned_funnel_id
                if payload.assigned_funnel_id is not None
                else target.get("assigned_funnel_id")
            )
            if not final_funnel_id:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="assigned_funnel_id é obrigatório para read_only.",
                )
            try:
                assert_funnel_assignable_to_org(supabase, organization_id, str(final_funnel_id))
            except ValueError as exc:
                raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

        mem_patch = {
            "role": final_role,
            "assigned_funnel_id": str(final_funnel_id) if final_funnel_id else None,
        }
        try:
            upd = (
                supabase.table("organization_members")
                .update(mem_patch)
                .eq("organization_id", organization_id)
                .eq("user_id", user_id)
                .execute()
            )
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Falha ao atualizar membro: {exc!s}",
            ) from exc
        rows = upd.data or []
        if not rows:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Membro não encontrado.")

    final = _membership_for_org(supabase, user_id, organization_id)
    if not final:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Membro não encontrado.")
    af = final.get("assigned_funnel_id")
    return OrgMembershipPublic(
        organization_id=str(final["organization_id"]),
        role=final["role"],
        assigned_funnel_id=str(af) if af is not None else None,
    )
