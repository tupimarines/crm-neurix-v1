"""
Ferramentas HTTP usadas pelo agente n8n (busca_cliente, busca_ultimo_pedido).
Resolve tenant pelo instance_token da inbox Uazapi e consulta Supabase com service role.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional
from uuid import UUID

from supabase import Client as SupabaseClient

from app.services.phone_normalize import digits_only
from app.services.webhook_lead_context import find_inbox_by_instance_token

# public.orders — mesma ordem que information_schema (validação no Supabase).
_ORDERS_FULL_SELECT = (
    "id, tenant_id, lead_id, client_name, client_company, product_summary, "
    "total, payment_status, created_at, stage, notes, products_json, "
    "applied_promotions_json, subtotal, discount_total, payment_method, client_id"
)


def _json_safe_for_n8n(value: Any) -> Any:
    """Normaliza valores vindos do Supabase para JSON (tool HTTP / n8n)."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, dict):
        return {str(k): _json_safe_for_n8n(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_json_safe_for_n8n(v) for v in value]
    if isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


def phone_from_whatsapp_jid_or_raw(value: str | None) -> str:
    """RemoteJid tipo 5541999999999@s.whatsapp.net → apenas dígitos do usuário."""
    if not value:
        return ""
    s = str(value).strip().split("@", 1)[0].strip()
    return digits_only(s)


def format_cnpj_display(digits_raw: str | None) -> str:
    d = digits_only(digits_raw or "")
    if len(d) != 14:
        return (digits_raw or "").strip()
    return f"{d[:2]}.{d[2:5]}.{d[5:8]}/{d[8:12]}-{d[12:]}"


def find_crm_client_row_by_phone(
    supabase: SupabaseClient,
    *,
    tenant_id: str,
    phone_digits: str,
) -> Optional[dict[str, Any]]:
    if len(phone_digits) < 4:
        return None
    try:
        res = (
            supabase.table("crm_clients")
            .select("*")
            .eq("tenant_id", tenant_id)
            .order("created_at", desc=True)
            .execute()
        )
        for r in res.data or []:
            phones_raw = r.get("phones")
            if not isinstance(phones_raw, list):
                continue
            for p in phones_raw:
                if digits_only(str(p)) == phone_digits:
                    return r
    except Exception:
        return None
    return None


def fetch_last_order_for_client(
    supabase: SupabaseClient,
    *,
    tenant_id: str,
    client_id: str,
) -> Optional[dict[str, Any]]:
    try:
        r = (
            supabase.table("orders")
            .select(_ORDERS_FULL_SELECT)
            .eq("tenant_id", tenant_id)
            .eq("client_id", client_id)
            .neq("payment_status", "cancelado")
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        if r.data:
            return r.data[0]
    except Exception:
        pass

    try:
        lr = supabase.table("leads").select("id").eq("client_id", client_id).execute()
        lead_ids = [str(x["id"]) for x in (lr.data or [])]
        if not lead_ids:
            return None
        r2 = (
            supabase.table("orders")
            .select(_ORDERS_FULL_SELECT)
            .eq("tenant_id", tenant_id)
            .in_("lead_id", lead_ids)
            .neq("payment_status", "cancelado")
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        if r2.data:
            return r2.data[0]
    except Exception:
        pass
    return None


def resolve_tenant_id_for_n8n(supabase: SupabaseClient, instance_token: str) -> Optional[str]:
    inbox = find_inbox_by_instance_token(supabase, instance_token)
    if not inbox:
        return None
    return str(inbox.get("tenant_id") or "").strip() or None


def resolve_inbox_row_for_n8n(supabase: SupabaseClient, instance_token: str) -> Optional[dict[str, Any]]:
    """Inbox completa (id, tenant_id, funnel_id) para lookup de lead."""
    row = find_inbox_by_instance_token(supabase, instance_token)
    if not row:
        return None
    return row


def normalize_whatsapp_chat_id(phone_or_jid: str | None) -> str:
    """RemoteJid completo ou só dígitos → JID padrão leads.whatsapp_chat_id."""
    if not phone_or_jid:
        return ""
    s = str(phone_or_jid).strip()
    if "@" in s:
        return s
    d = digits_only(s)
    if len(d) >= 4:
        return f"{d}@s.whatsapp.net"
    return s


def find_lead_by_whatsapp_chat(
    supabase: SupabaseClient,
    *,
    inbox_id: str,
    tenant_id: str,
    whatsapp_chat_id: str,
) -> Optional[dict[str, Any]]:
    """Mesma resolução que o webhook n8n — lead por inbox + chat, fallback tenant + chat."""
    chat = (whatsapp_chat_id or "").strip()
    if not chat:
        return None
    try:
        r = (
            supabase.table("leads")
            .select("id, stage, client_id, tenant_id, contact_name, inbox_id, whatsapp_chat_id")
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
            .select("id, stage, client_id, tenant_id, contact_name, inbox_id, whatsapp_chat_id")
            .eq("tenant_id", tenant_id)
            .eq("whatsapp_chat_id", chat)
            .limit(1)
            .execute()
        )
        if r2.data:
            return r2.data[0]
    except Exception:
        pass
    return None


def route_hint_from_stage(stage_name: str | None) -> str:
    """
    Valor estável para Switch no n8n (sem Redis).
    Alinhado aos nomes usados em POST /api/n8n/webhook (INTENT_TO_STAGE).
    """
    s = (stage_name or "").strip().lower()
    if s == "b2b":
        return "b2b"
    if s == "b2c":
        return "b2c"
    if s == "quero vender":
        return "revenda"
    if s == "pedido feito":
        return "pedido_feito"
    if s == "finalizado":
        return "finalizado"
    return "other"


def build_client_tool_payload(row: dict[str, Any]) -> dict[str, Any]:
    cnpj = row.get("cnpj")
    cnpj_d = digits_only(str(cnpj)) if cnpj else ""
    return {
        "found": True,
        "client_id": str(row["id"]),
        "person_type": row.get("person_type"),
        "display_name": row.get("display_name"),
        "contact_name": row.get("contact_name"),
        "cnpj": cnpj_d or None,
        "cnpj_formatted": format_cnpj_display(cnpj_d) if cnpj_d else None,
        "cpf": row.get("cpf"),
        "phones": row.get("phones") if isinstance(row.get("phones"), list) else [],
    }


def build_last_order_tool_payload(order: dict[str, Any] | None) -> dict[str, Any]:
    if not order:
        return {
            "has_previous_order": False,
            "order": None,
            "message": "Nenhum pedido anterior encontrado para este cadastro.",
        }
    order_out: dict[str, Any] = {}
    for key, raw in order.items():
        if key == "product_summary":
            order_out[key] = str(raw or "").strip()
        else:
            order_out[key] = _json_safe_for_n8n(raw)
    if order_out.get("id") is not None:
        order_out["id"] = str(order_out["id"])
    return {
        "has_previous_order": True,
        "order": order_out,
        "message": "Use product_summary e products_json para recapitular o pedido ao lojista.",
    }
