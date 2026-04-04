"""
Endpoints para ferramentas do agente n8n (API key, sem JWT).

- GET /api/n8n/tools/client-by-phone — busca_cliente
- GET /api/n8n/tools/last-order-by-phone — busca_ultimo_pedido

Parâmetros: instance_token (Uazapi), phone (RemoteJid completo ou só dígitos).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from supabase import Client as SupabaseClient

from app.dependencies import get_supabase, verify_n8n_api_key
from app.services.n8n_agent_tools import (
    build_client_tool_payload,
    build_last_order_tool_payload,
    fetch_last_order_for_client,
    find_crm_client_row_by_phone,
    phone_from_whatsapp_jid_or_raw,
    resolve_tenant_id_for_n8n,
)

router = APIRouter()


@router.get("/tools/client-by-phone")
async def n8n_tool_client_by_phone(
    instance_token: str = Query(..., min_length=1, description="Token da instância Uazapi (body.token / token-instance)."),
    phone: str = Query(..., min_length=4, description="RemoteJid (5541...@s.whatsapp.net) ou telefone com dígitos."),
    _caller: dict = Depends(verify_n8n_api_key),
    supabase: SupabaseClient = Depends(get_supabase),
):
    """
    Retorno para o LLM: found, dados do crm_clients (CNPJ formatado para confirmação verbal).
    """
    tid = resolve_tenant_id_for_n8n(supabase, instance_token.strip())
    if not tid:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Inbox não encontrada para este instance_token.",
        )
    digits = phone_from_whatsapp_jid_or_raw(phone)
    if len(digits) < 4:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Telefone inválido ou muito curto.",
        )
    row = find_crm_client_row_by_phone(supabase, tenant_id=tid, phone_digits=digits)
    if not row:
        return {
            "found": False,
            "message": "Nenhum cadastro encontrado para este número de WhatsApp.",
        }
    return build_client_tool_payload(row)


@router.get("/tools/last-order-by-phone")
async def n8n_tool_last_order_by_phone(
    instance_token: str = Query(..., min_length=1),
    phone: str = Query(..., min_length=4),
    _caller: dict = Depends(verify_n8n_api_key),
    supabase: SupabaseClient = Depends(get_supabase),
):
    """Último pedido do cliente identificado pelo telefone (mesmo critério de busca_cliente)."""
    tid = resolve_tenant_id_for_n8n(supabase, instance_token.strip())
    if not tid:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Inbox não encontrada para este instance_token.",
        )
    digits = phone_from_whatsapp_jid_or_raw(phone)
    if len(digits) < 4:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Telefone inválido ou muito curto.",
        )
    row = find_crm_client_row_by_phone(supabase, tenant_id=tid, phone_digits=digits)
    if not row:
        return {
            "client_found": False,
            "has_previous_order": False,
            "order": None,
            "message": "Cliente não encontrado — não é possível buscar pedido.",
        }
    client_id = str(row["id"])
    order = fetch_last_order_for_client(supabase, tenant_id=tid, client_id=client_id)
    out = build_last_order_tool_payload(order)
    out["client_found"] = True
    out["client_id"] = client_id
    return out
