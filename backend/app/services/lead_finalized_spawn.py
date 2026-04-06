"""
Spawn de lead novo quando um ciclo vai para FINALIZADO — usado pelo PATCH /stage e pelo webhook WhatsApp.

Quando o card finalizado ainda retém whatsapp_chat_id (spawn no PATCH falhou ou não ocorreu),
mensagens inbound continuariam a anexar ao card antigo; o processor chama
spawn_fresh_lead_after_finalized antes de gravar a mensagem.
"""

from __future__ import annotations

from supabase import Client as SupabaseClient

from app.observability import get_logger
from app.services.lead_board import upsert_pipeline_position
from app.services.webhook_lead_context import get_first_stage_slug_for_funnel

logger = get_logger("lead_finalized_spawn")


def _db_error_detail(exc: Exception) -> str:
    for attr in ("details", "message", "msg"):
        val = getattr(exc, attr, None)
        if isinstance(val, str) and val.strip():
            return val
    text = str(exc)
    return text or "Erro inesperado no banco."


def _is_missing_column_error(detail: str, column_name: str) -> bool:
    lowered = detail.lower()
    return "column" in lowered and column_name.lower() in lowered and (
        "does not exist" in lowered or "não existe" in lowered
    )


def fetch_pipeline_stages_for_funnel(
    supabase: SupabaseClient,
    *,
    data_tenant_id: str,
    funnel_id: str,
) -> list[dict]:
    try:
        stages_response = (
            supabase.table("pipeline_stages")
            .select("*")
            .eq("tenant_id", data_tenant_id)
            .eq("funnel_id", funnel_id)
            .order("order_position")
            .execute()
        )
        return stages_response.data or []
    except Exception as exc:
        detail = _db_error_detail(exc)
        if _is_missing_column_error(detail, "funnel_id"):
            stages_response = (
                supabase.table("pipeline_stages")
                .select("*")
                .eq("tenant_id", data_tenant_id)
                .order("order_position")
                .execute()
            )
            return stages_response.data or []
        raise


def spawn_fresh_lead_after_finalized(
    *,
    supabase: SupabaseClient,
    original_lead_id: str,
    lead_snapshot: dict,
    data_tenant_id: str,
    resolved_funnel_id: str,
    stages: list[dict],
) -> None:
    """
    Liberta o JID no lead original (FINALIZADO) e insere um lead novo no 1º estágio do funil.
    Chamado só quando o move já foi persistido; falhas no insert são logadas sem exceção (AC6).
    """
    jid = str(lead_snapshot.get("whatsapp_chat_id") or "").strip()
    inbox_raw = lead_snapshot.get("inbox_id")
    if not jid or not inbox_raw:
        return

    funnel_id = str(lead_snapshot.get("funnel_id") or resolved_funnel_id)
    tenant_id = str(lead_snapshot.get("tenant_id") or data_tenant_id)

    first_stage_name = (
        get_first_stage_slug_for_funnel(
            supabase,
            tenant_id=tenant_id,
            funnel_id=funnel_id,
        )
        or ""
    ).strip()
    if not first_stage_name and stages:
        first_stage_name = str(stages[0].get("name") or "").strip()
    if not first_stage_name:
        logger.error(
            "spawn_fresh_lead_after_finalized_no_first_stage",
            extra={"lead_id": original_lead_id, "funnel_id": funnel_id},
        )
        return

    first_key = first_stage_name.casefold()
    first_stage_row = next(
        (s for s in stages if str(s.get("name", "")).strip().casefold() == first_key),
        stages[0] if stages else None,
    )
    if not first_stage_row:
        logger.error(
            "spawn_fresh_lead_after_finalized_stage_row_missing",
            extra={"lead_id": original_lead_id, "funnel_id": funnel_id},
        )
        return
    first_stage_id = str(first_stage_row["id"])
    first_stage_name = str(first_stage_row.get("name") or first_stage_name).strip() or first_stage_name

    try:
        upd = (
            supabase.table("leads")
            .update({"whatsapp_chat_id": None})
            .eq("id", original_lead_id)
            .eq("tenant_id", data_tenant_id)
            .execute()
        )
        if not upd.data:
            logger.warning(
                "spawn_fresh_lead_clear_jid_no_row",
                extra={"lead_id": original_lead_id, "tenant_id": data_tenant_id},
            )
            return
    except Exception as exc:
        logger.exception(
            "spawn_fresh_lead_clear_jid_failed",
            extra={"lead_id": original_lead_id, "detail": _db_error_detail(exc)},
        )
        return

    new_lead: dict = {
        "tenant_id": tenant_id,
        "inbox_id": str(inbox_raw),
        "funnel_id": funnel_id,
        "whatsapp_chat_id": jid,
        "contact_name": (lead_snapshot.get("contact_name") or "Desconhecido"),
        "company_name": (lead_snapshot.get("company_name") or "Novo Lead"),
        "phone": lead_snapshot.get("phone"),
        "stage": first_stage_name,
        "value": 0,
        "products_json": [],
        "stock_reserved_json": [],
        "purchase_history_json": [],
    }
    cid = lead_snapshot.get("client_id")
    if cid:
        new_lead["client_id"] = str(cid)

    try:
        ins = supabase.table("leads").insert(new_lead).execute()
        rows = ins.data or []
        if not rows:
            logger.error(
                "spawn_fresh_lead_insert_empty",
                extra={"original_lead_id": original_lead_id, "funnel_id": funnel_id},
            )
            return
        new_id = str(rows[0]["id"])
    except Exception as exc:
        logger.exception(
            "spawn_fresh_lead_insert_failed",
            extra={"original_lead_id": original_lead_id, "detail": _db_error_detail(exc)},
        )
        return

    try:
        upsert_pipeline_position(
            supabase,
            lead_id=new_id,
            funnel_id=funnel_id,
            stage_id=first_stage_id,
            board_owner_user_id=data_tenant_id,
        )
    except Exception:
        logger.exception(
            "spawn_fresh_lead_pipeline_position_failed",
            extra={"new_lead_id": new_id, "original_lead_id": original_lead_id},
        )


def is_stage_name_finalized(stage_name: str | None) -> bool:
    return (stage_name or "").strip().casefold() == "finalizado"


def maybe_spawn_inbound_whatsapp_lead_if_finalized(
    supabase: SupabaseClient,
    *,
    inbox_row: dict,
    chat_id: str,
    lead_data: dict | None,
) -> dict | None:
    """
    Se o lead resolvido por (inbox, chat) está em FINALIZADO e ainda segura o JID (primário),
    executa spawn e devolve o snapshot mínimo do novo lead; senão devolve lead_data inalterado.
    """
    if not lead_data or not inbox_row:
        return lead_data

    if not is_stage_name_finalized(str(lead_data.get("stage") or "")):
        return lead_data

    tenant_id = str(inbox_row["tenant_id"])
    funnel_id = str(inbox_row["funnel_id"])
    lead_id = str(lead_data["id"])

    full = (
        supabase.table("leads")
        .select("*")
        .eq("id", lead_id)
        .limit(1)
        .execute()
    ).data or []
    if not full:
        return lead_data
    lead_row = full[0]

    is_primary = str(lead_row.get("tenant_id")) == tenant_id and str(
        lead_row.get("funnel_id") or ""
    ) == funnel_id
    if not is_primary:
        return lead_data

    if not lead_row.get("whatsapp_chat_id") or not lead_row.get("inbox_id"):
        return lead_data

    jid = str(lead_row.get("whatsapp_chat_id") or "").strip()
    if jid != chat_id.strip():
        return lead_data

    stages = fetch_pipeline_stages_for_funnel(
        supabase, data_tenant_id=tenant_id, funnel_id=funnel_id
    )
    if not stages:
        logger.error(
            "inbound_spawn_finalized_no_stages",
            extra={"lead_id": lead_id, "funnel_id": funnel_id},
        )
        return lead_data

    spawn_fresh_lead_after_finalized(
        supabase=supabase,
        original_lead_id=lead_id,
        lead_snapshot=lead_row,
        data_tenant_id=tenant_id,
        resolved_funnel_id=funnel_id,
        stages=stages,
    )

    refreshed = (
        supabase.table("leads")
        .select(_MIN_LEAD_COLS)
        .eq("inbox_id", str(inbox_row["id"]))
        .eq("whatsapp_chat_id", chat_id)
        .limit(1)
        .execute()
    ).data or []
    if refreshed:
        return refreshed[0]
    return lead_data


_MIN_LEAD_COLS = "id, stage, tenant_id, inbox_id, funnel_id"
