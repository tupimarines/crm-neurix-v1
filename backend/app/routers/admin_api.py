"""
Console Admin — endpoints restritos a superadmin (Sprint 6).

GET /api/admin/products e /api/admin/funnels permitem operar sobre tenant alvo
sem JWT desse tenant (somente superadmin).
"""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, Query
from supabase import Client as SupabaseClient

from app.authz import EffectiveRole, require_superadmin
from app.dependencies import get_supabase
from app.models.organization import OrganizationFunnelItem
from app.models.product import ProductResponse
from app.routers.products import _hydrate_legacy_category_from_category_id

router = APIRouter()


def _parse_ts(value) -> datetime:
    if isinstance(value, datetime):
        return value
    if value is None:
        raise ValueError("Timestamp ausente.")
    return datetime.fromisoformat(str(value).replace("Z", "+00:00"))


@router.get(
    "/products",
    response_model=list[ProductResponse],
    summary="Lista produtos de um tenant (superadmin)",
)
async def admin_list_products_by_tenant(
    tenant_id: str = Query(..., description="UUID do tenant (auth.users.id dono dos dados)"),
    _sa: EffectiveRole = Depends(require_superadmin),
    supabase: SupabaseClient = Depends(get_supabase),
):
    """Catálogo do tenant indicado — uso no Console Admin."""
    response = (
        supabase.table("products")
        .select("*")
        .eq("tenant_id", tenant_id)
        .order("created_at", desc=True)
        .execute()
    )
    rows = _hydrate_legacy_category_from_category_id(supabase, tenant_id, response.data or [])
    return [ProductResponse(**row) for row in rows]


@router.get(
    "/funnels",
    response_model=list[OrganizationFunnelItem],
    summary="Lista funis de um tenant (superadmin)",
)
async def admin_list_funnels_by_tenant(
    tenant_id: str = Query(..., description="UUID do tenant (auth.users.id)"),
    _sa: EffectiveRole = Depends(require_superadmin),
    supabase: SupabaseClient = Depends(get_supabase),
):
    """Funis do tenant — tabela read-only no console."""
    res = (
        supabase.table("funnels")
        .select("id, tenant_id, name, created_at, updated_at")
        .eq("tenant_id", tenant_id)
        .order("created_at", desc=False)
        .execute()
    )
    raw = res.data or []
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
