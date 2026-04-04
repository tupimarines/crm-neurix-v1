"""
Ferramentas HTTP usadas pelo agente n8n (busca_cliente, busca_ultimo_pedido).
Resolve tenant pelo instance_token da inbox Uazapi e consulta Supabase com service role.
"""

from __future__ import annotations

from typing import Any, Optional

from supabase import Client as SupabaseClient

from app.services.phone_normalize import digits_only
from app.services.webhook_lead_context import find_inbox_by_instance_token


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
            .select(
                "id, lead_id, client_id, product_summary, products_json, total, "
                "payment_status, payment_method, created_at",
            )
            .eq("tenant_id", tenant_id)
            .eq("client_id", client_id)
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
            .select(
                "id, lead_id, client_id, product_summary, products_json, total, "
                "payment_status, payment_method, created_at",
            )
            .eq("tenant_id", tenant_id)
            .in_("lead_id", lead_ids)
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
    summary = str(order.get("product_summary") or "").strip()
    total = order.get("total")
    created = order.get("created_at")
    return {
        "has_previous_order": True,
        "order": {
            "id": str(order.get("id", "")),
            "product_summary": summary,
            "total": total,
            "payment_status": order.get("payment_status"),
            "payment_method": order.get("payment_method"),
            "created_at": str(created) if created is not None else None,
            "products_json": order.get("products_json"),
        },
        "message": "Use product_summary e products_json para recapitular o pedido ao lojista.",
    }
