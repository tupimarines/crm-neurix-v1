"""
Dashboard Router — KPIs and Aggregated Metrics.
Maps to the Dashboard page (Taxa de Conversão, Faturamento, Volume de Mensagens).
"""

from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel, Field
from supabase import Client as SupabaseClient

from app.authz import EffectiveRole, get_effective_role
from app.dependencies import get_supabase, get_current_user
from app.routers.leads import _resolve_kanban_scope

router = APIRouter()


class KPIResponse(BaseModel):
    conversion_rate: float
    conversion_change: float
    monthly_revenue: float
    revenue_change: float
    message_volume: int
    message_change: float


class DashboardResponse(BaseModel):
    kpis: KPIResponse
    recent_orders: list[dict]


@router.get("/kpis", response_model=KPIResponse)
async def get_kpis(
    user=Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_supabase),
):
    """Get dashboard KPI metrics."""
    # Count leads and calculate conversion
    leads_response = supabase.table("leads").select("id, stage", count="exact").eq("tenant_id", user.id).execute()
    total_leads = leads_response.count or 0
    converted_stage_names: set[str] = set()
    try:
        stage_rows = (
            supabase.table("pipeline_stages")
            .select("name, is_conversion")
            .eq("tenant_id", user.id)
            .execute()
        ).data or []
        converted_stage_names = {
            str(row.get("name", "")).strip().lower()
            for row in stage_rows
            if bool(row.get("is_conversion"))
        }
    except Exception:
        # Migration may not be applied yet: in this case conversion remains opt-in (0%).
        converted_stage_names = set()

    converted = sum(
        1
        for l in (leads_response.data or [])
        if str(l.get("stage", "")).strip().lower() in converted_stage_names
    )
    conversion_rate = (converted / total_leads * 100) if total_leads > 0 else 0

    # Calculate monthly revenue from paid orders
    orders_response = supabase.table("orders") \
        .select("total, payment_status") \
        .eq("tenant_id", user.id) \
        .eq("payment_status", "pago") \
        .execute()
    monthly_revenue = sum(o.get("total", 0) for o in (orders_response.data or []))

    # Message volume (from chat_messages table, if exists)
    try:
        messages_response = supabase.table("chat_messages").select("id", count="exact").eq("tenant_id", user.id).execute()
        message_volume = messages_response.count or 0
    except Exception:
        message_volume = 0

    return KPIResponse(
        conversion_rate=round(conversion_rate, 1),
        conversion_change=0.0,  # TODO: compare with previous period
        monthly_revenue=monthly_revenue,
        revenue_change=0.0,
        message_volume=message_volume,
        message_change=0.0,
    )


@router.get("/recent-orders")
async def get_recent_orders(
    user=Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_supabase),
):
    """Get the most recent orders for the dashboard table."""
    response = supabase.table("orders") \
        .select("*") \
        .eq("tenant_id", user.id) \
        .order("created_at", desc=True) \
        .limit(10) \
        .execute()

    return response.data or []


class GlobalSearchItem(BaseModel):
    id: str
    name: str
    type: str = Field(..., description="lead | order | product")


class GlobalSearchResponse(BaseModel):
    results: list[GlobalSearchItem]


@router.get("/search", response_model=GlobalSearchResponse)
async def global_search(
    q: str = Query(..., min_length=2, max_length=120),
    user=Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_supabase),
    eff: EffectiveRole = Depends(get_effective_role),
):
    """
    Busca global para o painel (substitui view `global_search` no browser).
    Respeita escopo de funil para `read_only` nos leads.
    """
    try:
        data_tenant, resolved_funnel = _resolve_kanban_scope(supabase, user.id, eff, None)
    except HTTPException:
        raise
    raw = q.strip()
    term = f"%{raw}%"
    per_kind = 5
    results: list[GlobalSearchItem] = []

    lq = (
        supabase.table("leads")
        .select("id, contact_name, company_name")
        .eq("tenant_id", data_tenant)
    )
    if eff.is_read_only:
        lq = lq.eq("funnel_id", resolved_funnel)
    lr = lq.or_(f"contact_name.ilike.{term},company_name.ilike.{term}").limit(per_kind).execute()
    for row in lr.data or []:
        label = (row.get("contact_name") or row.get("company_name") or "").strip() or "Lead"
        results.append(GlobalSearchItem(id=str(row["id"]), name=label, type="lead"))

    ores = (
        supabase.table("orders")
        .select("id, client_name")
        .eq("tenant_id", data_tenant)
        .ilike("client_name", term)
        .limit(per_kind)
        .execute()
    )
    for row in ores.data or []:
        results.append(
            GlobalSearchItem(
                id=str(row["id"]),
                name=str(row.get("client_name") or "Pedido"),
                type="order",
            )
        )

    pres = (
        supabase.table("products")
        .select("id, name")
        .eq("tenant_id", data_tenant)
        .ilike("name", term)
        .limit(per_kind)
        .execute()
    )
    for row in pres.data or []:
        results.append(GlobalSearchItem(id=str(row["id"]), name=str(row.get("name") or "Produto"), type="product"))

    return GlobalSearchResponse(results=results[:15])
