"""
Escopo de organização — funis atribuíveis a membros (Sprint 4).

Funis pertencem a `funnels.tenant_id` (dono legado). Admins da organização
são os usuários com `organization_members.role = admin`; o funil atribuível
a read_only deve pertencer a um desses tenants.
"""

from __future__ import annotations

from typing import Any

from supabase import Client as SupabaseClient


def funnel_ids_for_organization(supabase: SupabaseClient, org_id: str) -> set[str]:
    """IDs de funis cujo `tenant_id` é um admin da organização."""
    mres = (
        supabase.table("organization_members")
        .select("user_id")
        .eq("organization_id", org_id)
        .eq("role", "admin")
        .execute()
    )
    admin_ids = [str(r["user_id"]) for r in (mres.data or [])]
    if not admin_ids:
        return set()
    fres = (
        supabase.table("funnels")
        .select("id")
        .in_("tenant_id", admin_ids)
        .execute()
    )
    return {str(r["id"]) for r in (fres.data or [])}


def list_funnels_for_organization(supabase: SupabaseClient, org_id: str) -> list[dict[str, Any]]:
    """Funis cujo tenant é um membro admin da organização (nome + tenant para UI/console)."""
    mres = (
        supabase.table("organization_members")
        .select("user_id")
        .eq("organization_id", org_id)
        .eq("role", "admin")
        .execute()
    )
    admin_ids = [str(r["user_id"]) for r in (mres.data or [])]
    if not admin_ids:
        return []
    fres = (
        supabase.table("funnels")
        .select("id, tenant_id, name, created_at, updated_at")
        .in_("tenant_id", admin_ids)
        .order("created_at", desc=False)
        .execute()
    )
    return list(fres.data or [])


def assert_funnel_assignable_to_org(
    supabase: SupabaseClient,
    org_id: str,
    funnel_id: str,
) -> None:
    """Levanta ValueError se o funil não pertence aos admins da org."""
    allowed = funnel_ids_for_organization(supabase, org_id)
    if funnel_id not in allowed:
        raise ValueError("Funil inválido ou não pertence a esta organização.")


def admin_user_ids_for_organization(supabase: SupabaseClient, org_id: str) -> set[str]:
    """user_id dos membros com papel admin na organização (tenants legados dos dados)."""
    mres = (
        supabase.table("organization_members")
        .select("user_id")
        .eq("organization_id", org_id)
        .eq("role", "admin")
        .execute()
    )
    return {str(r["user_id"]) for r in (mres.data or [])}
