"""
Dashboard Router — KPIs and Aggregated Metrics.
KPIs usam o funil "Funil-1" (nome normalizado funil-1) quando existir; senão o funil padrão do tenant.
"""

from __future__ import annotations

from calendar import monthrange
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
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
    new_contacts: int
    new_contacts_change: float = 0.0
    message_volume: int
    message_change: float


class DashboardResponse(BaseModel):
    kpis: KPIResponse
    recent_orders: list[dict]


def _normalize_funnel_name_key(name: str) -> str:
    return str(name or "").strip().casefold()


def _resolve_kpi_funnel_id(
    supabase: SupabaseClient,
    *,
    data_tenant_id: str,
    eff: EffectiveRole,
    scope_funnel_id: str,
) -> str:
    """read_only: sempre o funil atribuído. Demais: preferir funil nomeado funil-1 no tenant dos dados."""
    if eff.is_read_only:
        return str(scope_funnel_id)
    rows = (
        supabase.table("funnels")
        .select("id, name")
        .eq("tenant_id", data_tenant_id)
        .execute()
    ).data or []
    for r in rows:
        if _normalize_funnel_name_key(str(r.get("name") or "")) in ("funil-1", "funil 1"):
            return str(r["id"])
    return str(scope_funnel_id)


def _month_bounds_utc(now: datetime | None = None) -> tuple[datetime, datetime]:
    n = now or datetime.now(timezone.utc)
    if n.tzinfo is None:
        n = n.replace(tzinfo=timezone.utc)
    start = n.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    last = monthrange(n.year, n.month)[1]
    end = n.replace(day=last, hour=23, minute=59, second=59, microsecond=999999)
    return start, end


def _cf_stage(s: str) -> str:
    return str(s or "").strip().casefold()


def _pipeline_stage_id_by_name(
    supabase: SupabaseClient,
    *,
    data_tenant_id: str,
    funnel_id: str,
    name_casefold: str,
) -> Optional[str]:
    rows = (
        supabase.table("pipeline_stages")
        .select("id, name")
        .eq("tenant_id", data_tenant_id)
        .eq("funnel_id", funnel_id)
        .execute()
    ).data or []
    for r in rows:
        if _cf_stage(str(r.get("name") or "")) == name_casefold:
            return str(r["id"])
    return None


def _fetch_kpi_leads_id_stage(
    supabase: SupabaseClient,
    *,
    data_tenant_id: str,
    funnel_id: str,
) -> list[tuple[str, str]]:
    """Lista (id, stage) dos leads do funil KPI."""
    try:
        res = (
            supabase.table("leads")
            .select("id, stage")
            .eq("tenant_id", data_tenant_id)
            .eq("funnel_id", funnel_id)
            .eq("archived", False)
            .eq("deleted", False)
            .execute()
        )
    except Exception:
        res = (
            supabase.table("leads")
            .select("id, stage")
            .eq("tenant_id", data_tenant_id)
            .eq("funnel_id", funnel_id)
            .execute()
        )
    out: list[tuple[str, str]] = []
    for row in res.data or []:
        lid = row.get("id")
        if lid is None:
            continue
        out.append((str(lid), str(row.get("stage") or "")))
    return out


def _lead_ids_that_left_stage(
    supabase: SupabaseClient,
    *,
    from_stage_id: str,
    lead_ids: list[str],
    chunk_size: int = 150,
) -> set[str]:
    """lead_activity.from_stage_id indica que o card já esteve na etapa de origem."""
    found: set[str] = set()
    if not lead_ids:
        return found
    for i in range(0, len(lead_ids), chunk_size):
        batch = lead_ids[i : i + chunk_size]
        try:
            ar = (
                supabase.table("lead_activity")
                .select("lead_id")
                .eq("from_stage_id", from_stage_id)
                .eq("event_type", "stage_move")
                .in_("lead_id", batch)
                .execute()
            )
        except Exception:
            continue
        for r in ar.data or []:
            lid = r.get("lead_id")
            if lid:
                found.add(str(lid))
    return found


@router.get("/kpis", response_model=KPIResponse)
async def get_kpis(
    user=Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_supabase),
    eff: EffectiveRole = Depends(get_effective_role),
):
    """
    Taxa de conversão: cards hoje em finalizado / coorte que já esteve na etapa inicial (%).
    A coorte inicial = ainda em inicial OU já saiu de inicial (lead_activity.from_stage_id = etapa inicial).
    Faturamento mensal: soma de `total` de pedidos pagos, etapa finalizada (nome), mês corrente UTC.
    Novos contatos: cards atualmente na etapa inicial (mesmo funil KPI).
    """
    data_tenant_id, scope_funnel_id = _resolve_kanban_scope(supabase, str(user.id), eff, None)
    kpi_funnel_id = _resolve_kpi_funnel_id(
        supabase, data_tenant_id=data_tenant_id, eff=eff, scope_funnel_id=scope_funnel_id
    )

    inicial_cf = "inicial"
    fin_cf = "finalizado"

    lead_rows = _fetch_kpi_leads_id_stage(
        supabase, data_tenant_id=data_tenant_id, funnel_id=kpi_funnel_id
    )
    lead_stages = [s for _, s in lead_rows]

    inicial_stage_id = _pipeline_stage_id_by_name(
        supabase,
        data_tenant_id=data_tenant_id,
        funnel_id=kpi_funnel_id,
        name_casefold=inicial_cf,
    )

    current_inicial_ids = {lid for lid, st in lead_rows if _cf_stage(st) == inicial_cf}
    all_lead_ids = [lid for lid, _ in lead_rows]

    if inicial_stage_id and all_lead_ids:
        left_inicial_ids = _lead_ids_that_left_stage(
            supabase, from_stage_id=inicial_stage_id, lead_ids=all_lead_ids
        )
        inicial_cohort_count = len(current_inicial_ids | (set(all_lead_ids) & left_inicial_ids))
    else:
        # Sem id de etapa (migração antiga) ou sem leads: volta ao comportamento só por nome atual
        inicial_cohort_count = sum(1 for s in lead_stages if _cf_stage(s) == inicial_cf)

    inicial_count = sum(1 for s in lead_stages if _cf_stage(s) == inicial_cf)
    finalizado_count = sum(1 for s in lead_stages if _cf_stage(s) == fin_cf)
    conversion_rate = (
        (finalizado_count / inicial_cohort_count * 100.0) if inicial_cohort_count > 0 else 0.0
    )

    start, end = _month_bounds_utc()
    start_iso = start.isoformat()
    end_iso = end.isoformat()
    try:
        ores = (
            supabase.table("orders")
            .select("total, stage, payment_status, created_at")
            .eq("tenant_id", data_tenant_id)
            .eq("payment_status", "pago")
            .gte("created_at", start_iso)
            .lte("created_at", end_iso)
            .execute()
        )
    except Exception:
        ores = type("R", (), {"data": []})()

    monthly_revenue = 0.0
    for o in ores.data or []:
        if _cf_stage(str(o.get("stage") or "")) == fin_cf:
            try:
                monthly_revenue += float(o.get("total") or 0)
            except (TypeError, ValueError):
                pass

    new_contacts = inicial_count

    return KPIResponse(
        conversion_rate=round(conversion_rate, 1),
        conversion_change=0.0,
        monthly_revenue=round(monthly_revenue, 2),
        revenue_change=0.0,
        new_contacts=int(new_contacts),
        new_contacts_change=0.0,
        message_volume=int(new_contacts),
        message_change=0.0,
    )


@router.get("/recent-orders")
async def get_recent_orders(
    user=Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_supabase),
):
    """Get the most recent orders for the dashboard table."""
    response = (
        supabase.table("orders")
        .select("*")
        .eq("tenant_id", user.id)
        .order("created_at", desc=True)
        .limit(10)
        .execute()
    )

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
