"""
Dashboard Router — KPIs and Aggregated Metrics.
Maps to the Dashboard page (Taxa de Conversão, Faturamento, Volume de Mensagens).
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from supabase import Client as SupabaseClient

from app.dependencies import get_supabase, get_current_user

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
    converted = sum(1 for l in (leads_response.data or []) if l.get("stage") == "enviado")
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
