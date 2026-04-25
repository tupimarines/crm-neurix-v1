"""
Métricas de coorte da etapa «inicial» (denominador da taxa de conversão e badge do Kanban).

Coorte = leads ainda em «inicial» ∪ leads com stage_move saindo da etapa inicial (lead_activity.from_stage_id).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from supabase import Client as SupabaseClient


def cf_stage(s: str) -> str:
    return str(s or "").strip().casefold()


def pipeline_stage_id_by_name(
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
        if cf_stage(str(r.get("name") or "")) == name_casefold:
            return str(r["id"])
    return None


def fetch_leads_id_stage_for_funnel(
    supabase: SupabaseClient,
    *,
    data_tenant_id: str,
    funnel_id: str,
) -> list[tuple[str, str]]:
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


def lead_ids_that_left_stage(
    supabase: SupabaseClient,
    *,
    from_stage_id: str,
    lead_ids: list[str],
    chunk_size: int = 150,
) -> set[str]:
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


@dataclass(frozen=True)
class InicialCohortSnapshot:
    """Contagens alinhadas ao funil (tenant + funnel_id)."""

    inicial_cohort_count: int
    current_inicial_count: int
    finalizado_count: int
    inicial_stage_id: Optional[str]


def compute_inicial_cohort_snapshot(
    supabase: SupabaseClient,
    *,
    data_tenant_id: str,
    funnel_id: str,
) -> InicialCohortSnapshot:
    inicial_cf = "inicial"
    fin_cf = "finalizado"

    lead_rows = fetch_leads_id_stage_for_funnel(
        supabase, data_tenant_id=data_tenant_id, funnel_id=funnel_id
    )
    lead_stages = [s for _, s in lead_rows]

    inicial_stage_id = pipeline_stage_id_by_name(
        supabase,
        data_tenant_id=data_tenant_id,
        funnel_id=funnel_id,
        name_casefold=inicial_cf,
    )

    current_inicial_ids = {lid for lid, st in lead_rows if cf_stage(st) == inicial_cf}
    all_lead_ids = [lid for lid, _ in lead_rows]

    if inicial_stage_id and all_lead_ids:
        left_inicial_ids = lead_ids_that_left_stage(
            supabase, from_stage_id=inicial_stage_id, lead_ids=all_lead_ids
        )
        cohort = len(current_inicial_ids | (set(all_lead_ids) & left_inicial_ids))
    else:
        cohort = sum(1 for s in lead_stages if cf_stage(s) == inicial_cf)

    current_inicial = sum(1 for s in lead_stages if cf_stage(s) == inicial_cf)
    finalizado = sum(1 for s in lead_stages if cf_stage(s) == fin_cf)

    return InicialCohortSnapshot(
        inicial_cohort_count=cohort,
        current_inicial_count=current_inicial,
        finalizado_count=finalizado,
        inicial_stage_id=inicial_stage_id,
    )
