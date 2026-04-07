"""
Endpoints para ferramentas do agente n8n (API key, sem JWT).

- GET /api/n8n/tools/client-by-phone — busca_cliente
- GET /api/n8n/tools/last-order-by-phone — busca_ultimo_pedido
- GET /api/n8n/tools/lead-context — estágio do lead no CRM (roteamento sem Redis)

Parâmetros: instance_token (Uazapi), phone (RemoteJid completo ou só dígitos).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from supabase import Client as SupabaseClient

from app.dependencies import get_supabase, verify_n8n_api_key
from app.services.n8n_agent_tools import (
    MIN_PHONE_LOOKUP_DIGITS,
    build_client_tool_payload,
    build_last_order_tool_payload,
    fetch_last_order_for_client,
    find_lead_by_whatsapp_chat,
    normalize_whatsapp_chat_id,
    resolve_crm_client_for_n8n_phone,
    resolve_inbox_row_for_n8n,
    resolve_tenant_id_for_n8n,
    route_hint_from_stage,
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
    tid, _digits, row = resolve_crm_client_for_n8n_phone(
        supabase, instance_token=instance_token, phone=phone
    )
    if not tid:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Inbox não encontrada para este instance_token.",
        )
    if len(_digits) < MIN_PHONE_LOOKUP_DIGITS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Telefone inválido ou muito curto.",
        )
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
    """
    Último pedido do cliente identificado pelo telefone (mesmo critério de busca_cliente).
    Inclui `message_last`: texto pronto para enviar no WhatsApp (resumo + CTA).
    """
    tid, _digits, row = resolve_crm_client_for_n8n_phone(
        supabase, instance_token=instance_token, phone=phone
    )
    if not tid:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Inbox não encontrada para este instance_token.",
        )
    if len(_digits) < MIN_PHONE_LOOKUP_DIGITS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Telefone inválido ou muito curto.",
        )
    if not row:
        return {
            "client_found": False,
            "has_previous_order": False,
            "order": None,
            "message": "Cliente não encontrado — não é possível buscar pedido.",
            "message_last": (
                "Não encontramos cadastro para este número no CRM. "
                "Quer que eu te ajude a fazer um pedido do zero?"
            ),
        }
    client_id = str(row["id"])
    order = fetch_last_order_for_client(supabase, tenant_id=tid, client_id=client_id)
    out = build_last_order_tool_payload(order)
    out["client_found"] = True
    out["client_id"] = client_id
    return out


@router.get("/tools/lead-context")
async def n8n_tool_lead_context(
    instance_token: str = Query(..., min_length=1),
    phone: str = Query(..., min_length=4, description="RemoteJid ou dígitos; vira chat id do lead."),
    _caller: dict = Depends(verify_n8n_api_key),
    supabase: SupabaseClient = Depends(get_supabase),
):
    """
    Para o fluxo n8n: quando `tipo-cliente` vem vazio (texto livre), use o **estágio do lead**
    no CRM para saber se o contato já escolheu B2B/B2C/revenda (após move no funil).
    """
    inbox = resolve_inbox_row_for_n8n(supabase, instance_token.strip())
    if not inbox:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Inbox não encontrada para este instance_token.",
        )
    tenant_id = str(inbox["tenant_id"])
    inbox_id = str(inbox["id"])
    chat_id = normalize_whatsapp_chat_id(phone)
    if not chat_id or "@" not in chat_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="phone inválido (use RemoteJid ou número com DDI).",
        )

    lead = find_lead_by_whatsapp_chat(
        supabase,
        inbox_id=inbox_id,
        tenant_id=tenant_id,
        whatsapp_chat_id=chat_id,
    )
    if not lead:
        return {
            "found": False,
            "route_hint": "no_lead",
            "message": "Lead não encontrado para este chat — tratar como primeiro contato ou aguardar sync.",
        }

    stage = str(lead.get("stage") or "").strip()
    hint = route_hint_from_stage(stage)
    return {
        "found": True,
        "lead_id": str(lead.get("id", "")),
        "stage": stage,
        "route_hint": hint,
        "client_id": str(lead["client_id"]) if lead.get("client_id") else None,
        "contact_name": lead.get("contact_name"),
        "whatsapp_chat_id": lead.get("whatsapp_chat_id"),
    }
