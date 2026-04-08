"""
Sincronização Kanban multi-funil: lead_pipeline_positions, automação de etapa, auditoria.
"""

from __future__ import annotations

from typing import Any, Optional

from supabase import Client as SupabaseClient


def match_stage_column_name(stage_val: str, stages_data: list[dict]) -> str | None:
    if not stages_data:
        return None
    sv = str(stage_val or "").strip().lower()
    for s in stages_data:
        if str(s.get("name", "")).strip().lower() == sv:
            return str(s["name"])
    return None


def merge_kanban_lead_rows(
    *,
    supabase: SupabaseClient,
    primary_rows: list[dict],
    data_tenant_id: str,
    funnel_id: str,
    pipeline_board_owner_user_id: str,
) -> list[dict]:
    """
    Junta leads primários do funil com leads espelhados via lead_pipeline_positions
    (mesmo lead_id no board de outro dono).

    `pipeline_board_owner_user_id` é quem “possui” as posições neste funil: no board do
    admin costuma ser o tenant dono dos dados (`data_tenant_id`); no board read_only é o
    `user_id` do próprio read_only (espelho gravado por automação).
    """
    primary_by_id = {str(r["id"]): r for r in primary_rows}
    pos_res = (
        supabase.table("lead_pipeline_positions")
        .select("lead_id, stage_id")
        .eq("funnel_id", funnel_id)
        .eq("board_owner_user_id", pipeline_board_owner_user_id)
        .execute()
    )
    pos_rows = pos_res.data or []
    pos_by_lead = {str(p["lead_id"]): p for p in pos_rows}

    extra_ids: list[str] = []
    for p in pos_rows:
        lid = str(p["lead_id"])
        if lid not in primary_by_id:
            extra_ids.append(lid)

    extra_by_id: dict[str, dict] = {}
    if extra_ids:
        ex = supabase.table("leads").select("*").in_("id", list(set(extra_ids))).execute()
        for row in ex.data or []:
            extra_by_id[str(row["id"])] = row

    out: list[dict] = []
    seen: set[str] = set()

    for row in primary_rows:
        lid = str(row["id"])
        seen.add(lid)
        out.append(row)

    for lid, row in extra_by_id.items():
        if lid in seen:
            continue
        seen.add(lid)
        out.append(row)

    return out


def resolve_stage_name_for_board(
    lead_row: dict,
    *,
    funnel_id: str,
    data_tenant_id: str,
    stages_data: list[dict],
    pos_by_lead: dict[str, dict],
) -> str | None:
    """Nome da coluna (stage name) onde o card aparece neste board."""
    tid = str(lead_row.get("tenant_id") or "")
    fid = str(lead_row.get("funnel_id") or "")
    is_primary_here = tid == str(data_tenant_id) and fid == str(funnel_id)
    if is_primary_here:
        return match_stage_column_name(str(lead_row.get("stage") or ""), stages_data)

    pos = pos_by_lead.get(str(lead_row.get("id")))
    if not pos:
        return None
    sid = str(pos.get("stage_id"))
    for s in stages_data:
        if str(s.get("id")) == sid:
            return str(s.get("name") or "")
    return None


def build_pos_by_lead(
    supabase: SupabaseClient,
    *,
    funnel_id: str,
    pipeline_board_owner_user_id: str,
) -> dict[str, dict]:
    pos_res = (
        supabase.table("lead_pipeline_positions")
        .select("lead_id, stage_id")
        .eq("funnel_id", funnel_id)
        .eq("board_owner_user_id", pipeline_board_owner_user_id)
        .execute()
    )
    pos_rows = pos_res.data or []
    return {str(p["lead_id"]): p for p in pos_rows}


def upsert_pipeline_position(
    supabase: SupabaseClient,
    *,
    lead_id: str,
    funnel_id: str,
    stage_id: str,
    board_owner_user_id: str,
    sort_order: int = 0,
) -> None:
    supabase.table("lead_pipeline_positions").upsert(
        {
            "lead_id": lead_id,
            "funnel_id": funnel_id,
            "stage_id": stage_id,
            "board_owner_user_id": board_owner_user_id,
            "sort_order": sort_order,
        },
        on_conflict="lead_id,funnel_id,board_owner_user_id",
    ).execute()


def insert_lead_activity(
    supabase: SupabaseClient,
    *,
    lead_id: str,
    event_type: str,
    actor_user_id: str,
    from_stage_id: Optional[str],
    to_stage_id: Optional[str],
    metadata: Optional[dict[str, Any]] = None,
) -> None:
    supabase.table("lead_activity").insert(
        {
            "lead_id": lead_id,
            "event_type": event_type,
            "from_stage_id": from_stage_id,
            "to_stage_id": to_stage_id,
            "actor_user_id": actor_user_id,
            "metadata": metadata or {},
        }
    ).execute()


def fetch_stage_automation_for_source_stage(
    supabase: SupabaseClient,
    *,
    source_funnel_id: str,
    source_stage_id: str,
) -> Optional[dict[str, Any]]:
    res = (
        supabase.table("stage_automations")
        .select("*")
        .eq("source_funnel_id", source_funnel_id)
        .eq("source_stage_id", source_stage_id)
        .limit(1)
        .execute()
    )
    rows = res.data or []
    return rows[0] if rows else None


def apply_destination_mirror(
    supabase: SupabaseClient,
    *,
    lead_id: str,
    automation: dict[str, Any],
) -> None:
    """Espelha o mesmo lead no funil/etapa de destino (visão dupla)."""
    upsert_pipeline_position(
        supabase,
        lead_id=lead_id,
        funnel_id=str(automation["target_funnel_id"]),
        stage_id=str(automation["target_stage_id"]),
        board_owner_user_id=str(automation["target_user_id"]),
        sort_order=0,
    )
