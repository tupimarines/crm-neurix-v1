"""
Autorização RBAC mínima — perfil Supabase + organization_members.

Service role bypassa RLS; esta camada é a fonte de verdade na API para papéis.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional

from fastapi import Depends, HTTPException, status
from supabase import Client as SupabaseClient

from app.dependencies import get_current_user, get_supabase


@dataclass(frozen=True)
class EffectiveRole:
    """Papel efetivo após resolver perfil + memberships."""

    user_id: str
    is_superadmin: bool
    legacy_profile_role: str
    profile_organization_id: Optional[str]
    org_member_role: Optional[str]
    org_member_organization_id: Optional[str]

    @property
    def is_org_admin(self) -> bool:
        """Superadmin, admin em organization_members ou legado tenant admin sem vínculo org."""
        if self.is_superadmin:
            return True
        if self.org_member_role == "admin":
            return True
        if self.org_member_role is None and self.legacy_profile_role == "admin":
            return True
        return False


def compute_effective_role(
    user_id: str,
    profile: Optional[dict[str, Any]],
    memberships: list[dict[str, Any]],
) -> EffectiveRole:
    """Puro — usado por fetch e por testes."""
    legacy = (profile or {}).get("role") or "admin"
    is_super = bool((profile or {}).get("is_superadmin"))
    prof_org = (profile or {}).get("organization_id")

    chosen: Optional[dict[str, Any]] = None
    if prof_org and memberships:
        ps = str(prof_org)
        for m in memberships:
            if str(m.get("organization_id")) == ps:
                chosen = m
                break
    if chosen is None and memberships:
        chosen = memberships[0]

    om_role = chosen.get("role") if chosen else None
    om_org = str(chosen["organization_id"]) if chosen and chosen.get("organization_id") is not None else None

    return EffectiveRole(
        user_id=user_id,
        is_superadmin=is_super,
        legacy_profile_role=legacy,
        profile_organization_id=str(prof_org) if prof_org else None,
        org_member_role=om_role,
        org_member_organization_id=om_org,
    )


def fetch_effective_role(supabase: SupabaseClient, user: Any) -> EffectiveRole:
    uid = str(user.id)
    pres = (
        supabase.table("profiles")
        .select("is_superadmin, organization_id, role")
        .eq("id", uid)
        .limit(1)
        .execute()
    )
    rows = pres.data or []
    profile = rows[0] if rows else None

    mres = (
        supabase.table("organization_members")
        .select("organization_id, role, assigned_funnel_id")
        .eq("user_id", uid)
        .execute()
    )
    memberships = mres.data or []

    return compute_effective_role(uid, profile, memberships)


def get_effective_role(
    user=Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_supabase),
) -> EffectiveRole:
    """Resolve papel efetivo (JWT + DB)."""
    return fetch_effective_role(supabase, user)


def require_superadmin(
    eff: EffectiveRole = Depends(get_effective_role),
) -> EffectiveRole:
    if not eff.is_superadmin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso restrito a superadmin.",
        )
    return eff


def require_org_admin(
    eff: EffectiveRole = Depends(get_effective_role),
) -> EffectiveRole:
    if not eff.is_org_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso restrito a administrador da organização.",
        )
    return eff
