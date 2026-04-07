"""
Alinha `leads.phone` (exibição no card) com `crm_clients.phones` quando há vínculo.
"""

from __future__ import annotations

from typing import Any, Optional

from supabase import Client as SupabaseClient

from app.services.phone_normalize import format_brazil_phone_display


def display_phone_from_client_phones_json(phones_raw: Any) -> Optional[str]:
    """Primeiro telefone do cliente → texto exibível BR; None se vazio."""
    if not isinstance(phones_raw, list) or not phones_raw:
        return None
    first = str(phones_raw[0]).strip()
    if not first:
        return None
    out = format_brazil_phone_display(first)
    return out or None


def fetch_display_phone_for_crm_client(
    supabase: SupabaseClient,
    *,
    tenant_id: str,
    client_id: str,
) -> Optional[str]:
    try:
        r = (
            supabase.table("crm_clients")
            .select("phones")
            .eq("id", client_id)
            .eq("tenant_id", tenant_id)
            .single()
            .execute()
        )
        if not r.data:
            return None
        return display_phone_from_client_phones_json(r.data.get("phones"))
    except Exception:
        return None


def sync_all_leads_phone_for_client(
    supabase: SupabaseClient,
    *,
    tenant_id: str,
    client_id: str,
) -> None:
    """Atualiza `phone` em todos os leads do tenant vinculados ao cliente."""
    want = fetch_display_phone_for_crm_client(supabase, tenant_id=tenant_id, client_id=client_id)
    if not want:
        return
    try:
        supabase.table("leads").update({"phone": want}).eq("tenant_id", tenant_id).eq("client_id", client_id).execute()
    except Exception:
        pass
