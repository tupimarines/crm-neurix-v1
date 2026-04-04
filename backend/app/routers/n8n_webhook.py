"""
N8n Unified Webhook Router — POST /api/n8n/webhook
Routes by intent: perfil_b2c, perfil_b2b, perfil_revenda, cart_update, pedido.
Auth: API key via X-CRM-API-Key header (no JWT).
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from supabase import Client as SupabaseClient

from app.dependencies import get_supabase, verify_n8n_api_key
from app.models.n8n_webhook import (
    N8nWebhookPayload,
    N8nWebhookResponse,
    build_products_json,
    generate_client_name,
    generate_product_summary,
    parse_brl_to_float,
)
from app.observability import get_logger
from app.services.lead_board import (
    fetch_stage_automation_for_source_stage,
    apply_destination_mirror,
    insert_lead_activity,
    upsert_pipeline_position,
)
from app.services.webhook_lead_context import (
    find_inbox_by_instance_token,
    resolve_or_create_crm_client,
)
from app.services.phone_normalize import digits_only

router = APIRouter()
logger = get_logger("n8n_webhook")

INTENT_TO_STAGE = {
    "perfil_b2c": "B2C",
    "perfil_b2b": "B2B",
    "perfil_revenda": "Quero Vender",
    "pedido": "Pedido Feito",
}


def _resolve_inbox(supabase: SupabaseClient, instance_token: str) -> dict:
    inbox = find_inbox_by_instance_token(supabase, instance_token)
    if not inbox:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Inbox não encontrada para o instance_token informado.",
        )
    return inbox


def _resolve_lead(
    supabase: SupabaseClient,
    *,
    inbox_id: str,
    tenant_id: str,
    whatsapp_chat_id: str,
) -> dict:
    chat = whatsapp_chat_id.strip()

    try:
        r = (
            supabase.table("leads")
            .select("*")
            .eq("inbox_id", inbox_id)
            .eq("whatsapp_chat_id", chat)
            .limit(1)
            .execute()
        )
        if r.data:
            return r.data[0]
    except Exception:
        pass

    try:
        r2 = (
            supabase.table("leads")
            .select("*")
            .eq("tenant_id", tenant_id)
            .eq("whatsapp_chat_id", chat)
            .limit(1)
            .execute()
        )
        if r2.data:
            return r2.data[0]
    except Exception:
        pass

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Lead não encontrado para este chat. Verifique se o webhook Uazapi já processou a primeira mensagem.",
    )


def _resolve_stage_case_insensitive(
    supabase: SupabaseClient,
    *,
    tenant_id: str,
    funnel_id: str,
    target_stage_name: str,
) -> dict | None:
    try:
        res = (
            supabase.table("pipeline_stages")
            .select("id, name, order_position")
            .eq("tenant_id", tenant_id)
            .eq("funnel_id", funnel_id)
            .order("order_position")
            .execute()
        )
        target_lower = target_stage_name.strip().lower()
        for row in res.data or []:
            if str(row.get("name", "")).strip().lower() == target_lower:
                return row
    except Exception:
        pass
    return None


def _move_lead_to_stage(
    supabase: SupabaseClient,
    *,
    lead_row: dict,
    stage_row: dict,
    funnel_id: str,
    tenant_id: str,
    intent: str,
    button_id: str | None,
) -> str:
    """Move lead to the resolved stage. Returns the canonical stage name."""
    canonical_name = str(stage_row["name"])
    stage_id = str(stage_row["id"])
    lead_id = str(lead_row["id"])

    supabase.table("leads").update({"stage": canonical_name}).eq("id", lead_id).execute()

    upsert_pipeline_position(
        supabase,
        lead_id=lead_id,
        funnel_id=funnel_id,
        stage_id=stage_id,
        board_owner_user_id=tenant_id,
    )

    prev_stage_name = str(lead_row.get("stage") or "").strip().lower()
    from_stage_id: str | None = None
    try:
        stages_res = (
            supabase.table("pipeline_stages")
            .select("id, name")
            .eq("tenant_id", tenant_id)
            .eq("funnel_id", funnel_id)
            .execute()
        )
        for s in stages_res.data or []:
            if str(s.get("name", "")).strip().lower() == prev_stage_name:
                from_stage_id = str(s["id"])
                break
    except Exception:
        pass

    insert_lead_activity(
        supabase,
        lead_id=lead_id,
        event_type="stage_move",
        actor_user_id=tenant_id,
        from_stage_id=from_stage_id,
        to_stage_id=stage_id,
        metadata={"source": "n8n", "intent": intent, "button_id": button_id, "funnel_id": funnel_id},
    )

    auto = fetch_stage_automation_for_source_stage(
        supabase, source_funnel_id=funnel_id, source_stage_id=stage_id,
    )
    if auto:
        apply_destination_mirror(supabase, lead_id=lead_id, automation=auto)

    return canonical_name


def _fetch_tenant_products(supabase: SupabaseClient, tenant_id: str) -> list[dict]:
    try:
        res = (
            supabase.table("products")
            .select("id, name, price, category_id, tenant_id, is_active")
            .eq("tenant_id", tenant_id)
            .eq("is_active", True)
            .execute()
        )
        return res.data or []
    except Exception:
        return []


def _update_products_json(
    supabase: SupabaseClient,
    *,
    lead_row: dict,
    payload: N8nWebhookPayload,
    tenant_id: str,
) -> tuple[list[dict], list[str]]:
    """Process order_summary → update leads.products_json.
    Returns (products_json, warnings). No-op if order_summary is empty/None."""
    if not payload.order_summary:
        return lead_row.get("products_json") or [], []

    products_db = _fetch_tenant_products(supabase, tenant_id)
    products_json, warnings = build_products_json(payload.order_summary, products_db, tenant_id)

    total_value = parse_brl_to_float(payload.total_value)
    if total_value <= 0 and products_json:
        total_value = round(
            sum(float(line.get("line_total") or 0) for line in products_json),
            2,
        )
    update_data: dict = {"products_json": products_json}
    if total_value > 0:
        update_data["value"] = total_value

    supabase.table("leads").update(update_data).eq("id", lead_row["id"]).execute()
    return products_json, warnings


def _append_note_timeline(
    supabase: SupabaseClient,
    *,
    lead_row: dict,
    payload: N8nWebhookPayload,
) -> None:
    if not payload.note_timeline:
        return
    existing_notes = str(lead_row.get("notes") or "")
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M")
    new_entries = "\n".join(
        f"[{e.timestamp or ts}] {e.content}" for e in payload.note_timeline
    )
    separator = "\n---\n" if existing_notes.strip() else ""
    updated = f"{existing_notes}{separator}{new_entries}"
    try:
        supabase.table("leads").update({"notes": updated[:4000]}).eq("id", lead_row["id"]).execute()
    except Exception:
        logger.warning("n8n_note_timeline_append_failed", extra={"lead_id": lead_row["id"]})


def _link_client_to_lead(
    supabase: SupabaseClient,
    *,
    lead_row: dict,
    client_id: str,
) -> None:
    if lead_row.get("client_id"):
        return
    try:
        supabase.table("leads").update({"client_id": client_id}).eq("id", lead_row["id"]).execute()
    except Exception:
        logger.warning("n8n_client_link_failed", extra={"lead_id": lead_row["id"], "client_id": client_id})


@router.post("/webhook", response_model=N8nWebhookResponse)
async def n8n_webhook(
    payload: N8nWebhookPayload,
    _caller: dict = Depends(verify_n8n_api_key),
    supabase: SupabaseClient = Depends(get_supabase),
):
    inbox = _resolve_inbox(supabase, payload.instance_token)
    tenant_id = str(inbox["tenant_id"])
    funnel_id = str(inbox["funnel_id"])
    inbox_id = str(inbox["id"])

    lead_row = _resolve_lead(
        supabase,
        inbox_id=inbox_id,
        tenant_id=tenant_id,
        whatsapp_chat_id=payload.whatsapp_chat_id,
    )
    lead_id = str(lead_row["id"])
    warnings: list[str] = []

    _append_note_timeline(supabase, lead_row=lead_row, payload=payload)

    # ── perfil_b2c / perfil_b2b / perfil_revenda ──
    if payload.intent in ("perfil_b2c", "perfil_b2b", "perfil_revenda"):
        target_stage_name = INTENT_TO_STAGE[payload.intent]
        stage_row = _resolve_stage_case_insensitive(
            supabase, tenant_id=tenant_id, funnel_id=funnel_id, target_stage_name=target_stage_name,
        )
        if not stage_row:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Etapa '{target_stage_name}' não encontrada no funil. Crie essa etapa no Kanban.",
            )

        client_id: str | None = None
        phone_raw = payload.phone or ""
        phone_digits = digits_only(phone_raw)
        if phone_digits:
            client_id = resolve_or_create_crm_client(
                supabase,
                tenant_id=tenant_id,
                sender_phone_raw=phone_raw,
                sender_name=payload.lead_name or "",
            )
            if client_id:
                _link_client_to_lead(supabase, lead_row=lead_row, client_id=client_id)

        if payload.lead_name and not lead_row.get("contact_name"):
            try:
                supabase.table("leads").update({"contact_name": payload.lead_name}).eq("id", lead_id).execute()
            except Exception:
                pass

        canonical = _move_lead_to_stage(
            supabase,
            lead_row=lead_row,
            stage_row=stage_row,
            funnel_id=funnel_id,
            tenant_id=tenant_id,
            intent=payload.intent,
            button_id=payload.button_id,
        )

        return N8nWebhookResponse(
            status="ok",
            lead_id=lead_id,
            client_id=client_id,
            stage=canonical,
            message=f"Lead movido para '{canonical}'. Client {'vinculado' if client_id else 'não vinculado (sem telefone)'}.",
            warnings=warnings,
        )

    # ── cart_update ──
    if payload.intent == "cart_update":
        products_json, w = _update_products_json(
            supabase, lead_row=lead_row, payload=payload, tenant_id=tenant_id,
        )
        warnings.extend(w)

        return N8nWebhookResponse(
            status="ok",
            lead_id=lead_id,
            stage=lead_row.get("stage"),
            message=f"products_json atualizado com {len(products_json)} itens." if payload.order_summary else "Nenhuma alteração (order_summary vazio).",
            warnings=warnings,
        )

    # ── pedido ──
    if payload.intent == "pedido":
        products_json, w = _update_products_json(
            supabase, lead_row=lead_row, payload=payload, tenant_id=tenant_id,
        )
        warnings.extend(w)

        client_id = str(lead_row.get("client_id") or "")
        client_row: dict | None = None
        if client_id:
            try:
                cr = supabase.table("crm_clients").select("id, display_name").eq("id", client_id).limit(1).execute()
                client_row = (cr.data or [None])[0]
            except Exception:
                pass
        elif payload.phone:
            resolved_cid = resolve_or_create_crm_client(
                supabase,
                tenant_id=tenant_id,
                sender_phone_raw=payload.phone,
                sender_name=payload.lead_name or "",
            )
            if resolved_cid:
                client_id = resolved_cid
                _link_client_to_lead(supabase, lead_row=lead_row, client_id=resolved_cid)
                try:
                    cr = supabase.table("crm_clients").select("id, display_name").eq("id", resolved_cid).limit(1).execute()
                    client_row = (cr.data or [None])[0]
                except Exception:
                    pass

        client_name = generate_client_name(lead_row, payload, client_row)
        product_summary = generate_product_summary(payload.order_summary or [])
        total = parse_brl_to_float(payload.total_value)
        if total <= 0 and products_json:
            total = round(
                sum(float(line.get("line_total") or 0) for line in products_json),
                2,
            )

        # Idempotency: check for recent pending order on same lead
        order_id: str | None = None
        existing_order: dict | None = None
        try:
            eo = (
                supabase.table("orders")
                .select("id, created_at")
                .eq("lead_id", lead_id)
                .eq("tenant_id", tenant_id)
                .eq("payment_status", "pendente")
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )
            if eo.data:
                created = eo.data[0].get("created_at", "")
                if created:
                    created_str = str(created).replace("Z", "+00:00")
                    created_dt = datetime.fromisoformat(created_str)
                    if created_dt.tzinfo is None:
                        created_dt = created_dt.replace(tzinfo=timezone.utc)
                    age_minutes = (datetime.now(timezone.utc) - created_dt).total_seconds() / 60
                    if age_minutes < 60:
                        existing_order = eo.data[0]
        except Exception:
            pass

        order_payload = {
            "tenant_id": tenant_id,
            "lead_id": lead_id,
            "client_id": client_id or None,
            "client_name": client_name,
            "product_summary": product_summary,
            "products_json": products_json,
            "total": total,
            "subtotal": total,
            "discount_total": 0.0,
            "payment_status": "pendente",
            "payment_method": payload.payment_method,
            "stage": "Novo Pedido",
        }

        try:
            if existing_order:
                upd = (
                    supabase.table("orders")
                    .update(order_payload)
                    .eq("id", existing_order["id"])
                    .execute()
                )
                order_id = existing_order["id"]
            else:
                ins = supabase.table("orders").insert(order_payload).execute()
                if ins.data:
                    order_id = str(ins.data[0]["id"])
        except Exception as exc:
            logger.exception("n8n_order_create_failed", extra={"lead_id": lead_id, "error": str(exc)})
            warnings.append(f"Erro ao criar/atualizar order: {exc}")

        # Move lead to "Pedido Feito"
        target_stage_name = INTENT_TO_STAGE["pedido"]
        stage_row = _resolve_stage_case_insensitive(
            supabase, tenant_id=tenant_id, funnel_id=funnel_id, target_stage_name=target_stage_name,
        )
        canonical: str | None = None
        if stage_row:
            canonical = _move_lead_to_stage(
                supabase,
                lead_row=lead_row,
                stage_row=stage_row,
                funnel_id=funnel_id,
                tenant_id=tenant_id,
                intent=payload.intent,
                button_id=payload.button_id,
            )
        else:
            warnings.append(f"Etapa '{target_stage_name}' não encontrada no funil — lead não foi movido.")

        return N8nWebhookResponse(
            status="ok",
            lead_id=lead_id,
            client_id=client_id or None,
            stage=canonical,
            order_id=order_id,
            message=f"Pedido {'atualizado' if existing_order else 'criado'}. Lead movido para '{canonical or 'N/A'}'.",
            warnings=warnings,
        )

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=f"Intent '{payload.intent}' não reconhecido.",
    )
