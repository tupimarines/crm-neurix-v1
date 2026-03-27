"""
Resolução de inbox Uazapi, estágio inicial e cliente CRM para o worker de webhook (Sprint 9).
"""

from __future__ import annotations

import json
from typing import Any, Optional

from supabase import Client as SupabaseClient

from app.services.phone_normalize import digits_only

# Alinhado a backend/app/routers/whatsapp.py — token da instância na caixa
UAZAPI_INSTANCE_TOKEN_KEY = "instance_token"


def find_inbox_by_instance_token(supabase: SupabaseClient, instance_token: str) -> Optional[dict[str, Any]]:
    """Varre inboxes (volume típico baixo) e compara instance_token em uazapi_settings."""
    if not instance_token:
        return None
    try:
        res = supabase.table("inboxes").select("id, tenant_id, funnel_id, name, uazapi_settings").execute()
        for row in res.data or []:
            settings = row.get("uazapi_settings") or {}
            if not isinstance(settings, dict):
                continue
            t = settings.get(UAZAPI_INSTANCE_TOKEN_KEY)
            if t is not None and str(t).strip() == str(instance_token).strip():
                return row
    except Exception:
        return None
    return None


def find_legacy_tenant_id_for_token(supabase: SupabaseClient, instance_token: str) -> Optional[str]:
    """Resolve tenant_id pela linha legada em settings (valor pode ser string JSON ou texto)."""
    if not instance_token:
        return None
    candidates = [
        instance_token,
        json.dumps(instance_token),
        f'"{instance_token}"',
    ]
    for val in candidates:
        try:
            resp = (
                supabase.table("settings")
                .select("tenant_id")
                .eq("key", "uazapi_instance_token")
                .eq("value", val)
                .limit(1)
                .execute()
            )
            if resp.data:
                return str(resp.data[0]["tenant_id"])
        except Exception:
            continue
    return None


def slugify_stage_name(name: str) -> str:
    """Converte nome de coluna do funil em slug alinhado a LeadStage / keyword engine."""
    return "_".join(name.strip().lower().split())


# Alinhado ao CHECK legado em leads.stage (001) — evita INSERT inválido se o funil tiver nomes livres.
_ALLOWED_LEAD_STAGES = frozenset(
    {"contato_inicial", "escolhendo_sabores", "aguardando_pagamento", "enviado"}
)


def clamp_stage_slug(slug: str) -> str:
    return slug if slug in _ALLOWED_LEAD_STAGES else "contato_inicial"


def get_first_stage_slug_for_funnel(
    supabase: SupabaseClient,
    *,
    tenant_id: str,
    funnel_id: str,
) -> str:
    """Primeiro estágio do funil (order_position); fallback contato_inicial; restringe aos slugs permitidos no DB legado."""
    try:
        res = (
            supabase.table("pipeline_stages")
            .select("name, order_position")
            .eq("tenant_id", tenant_id)
            .eq("funnel_id", funnel_id)
            .order("order_position")
            .limit(1)
            .execute()
        )
        rows = res.data or []
        if rows:
            return clamp_stage_slug(slugify_stage_name(str(rows[0]["name"])))
    except Exception:
        pass
    return "contato_inicial"


def resolve_or_create_crm_client(
    supabase: SupabaseClient,
    *,
    tenant_id: str,
    sender_phone_raw: str,
    sender_name: str,
) -> Optional[str]:
    """
    Resolve cliente por telefone normalizado; cria PF se não existir.
    Retorna UUID do crm_clients ou None se falhar gravação.
    """
    digits = digits_only(sender_phone_raw)
    if not digits:
        return None

    try:
        existing = (
            supabase.table("crm_clients")
            .select("id, phones")
            .eq("tenant_id", tenant_id)
            .execute()
        )
        for row in existing.data or []:
            phones = row.get("phones")
            if not isinstance(phones, list):
                continue
            for p in phones:
                if digits_only(str(p)) == digits:
                    return str(row["id"])
    except Exception:
        pass

    display = (sender_name or "").strip() or digits
    contact = (sender_name or "").strip() or None
    phones_json = [digits]
    insert_payload = {
        "tenant_id": tenant_id,
        "person_type": "PF",
        "display_name": display[:500],
        "contact_name": contact[:500] if contact else display[:500],
        "phones": phones_json,
    }
    try:
        ins = supabase.table("crm_clients").insert(insert_payload).execute()
        if ins.data:
            return str(ins.data[0]["id"])
    except Exception:
        return None
    return None
