"""
Leads Router — CRUD + Kanban Stage Management + Chat Mirror
Provides the data for the Funil de Vendas Kanban board and WhatsApp chat integration.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query, BackgroundTasks
from supabase import Client as SupabaseClient
from typing import Optional

from app.dependencies import get_supabase, get_current_user
from app.models.lead import (
    LeadCreate, LeadUpdate, LeadMoveStage, LeadResponse,
    KanbanBoard, KanbanColumn, LeadStage,
)
from app.models.chat_message import SendMessagePayload
from app.services.uazapi_service import get_uazapi_service

router = APIRouter()

STAGE_LABELS = {
    LeadStage.CONTATO_INICIAL: "Contato Inicial",
    LeadStage.ESCOLHENDO_SABORES: "Escolhendo Sabores",
    LeadStage.AGUARDANDO_PAGAMENTO: "Aguardando Pagamento",
    LeadStage.ENVIADO: "Enviado",
}


@router.get("/kanban", response_model=KanbanBoard)
async def get_kanban_board(
    user=Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_supabase),
):
    """Get all leads organized as a Kanban board with columns."""
    response = supabase.table("leads") \
        .select("*") \
        .eq("tenant_id", user.id) \
        .order("created_at", desc=False) \
        .execute()

    leads_by_stage: dict[LeadStage, list] = {stage: [] for stage in LeadStage}

    for row in response.data:
        stage = LeadStage(row.get("stage", LeadStage.CONTATO_INICIAL))
        leads_by_stage[stage].append(LeadResponse(**row))

    columns = []
    for stage in LeadStage:
        stage_leads = leads_by_stage[stage]
        columns.append(KanbanColumn(
            stage=stage,
            label=STAGE_LABELS[stage],
            count=len(stage_leads),
            total_value=sum(l.value for l in stage_leads),
            leads=stage_leads,
        ))

    return KanbanBoard(columns=columns)


@router.get("/", response_model=list[LeadResponse])
async def list_leads(
    stage: Optional[LeadStage] = None,
    search: Optional[str] = Query(None, min_length=1),
    user=Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_supabase),
):
    """List leads with optional stage and search filters."""
    query = supabase.table("leads").select("*").eq("tenant_id", user.id).order("created_at", desc=True)

    if stage:
        query = query.eq("stage", stage.value)
    if search:
        query = query.or_(f"company_name.ilike.%{search}%,contact_name.ilike.%{search}%")

    response = query.execute()
    return [LeadResponse(**row) for row in response.data]


@router.post("/", response_model=LeadResponse, status_code=status.HTTP_201_CREATED)
async def create_lead(
    payload: LeadCreate,
    user=Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_supabase),
):
    """Create a new lead/card."""
    data = payload.model_dump()
    data["tenant_id"] = user.id

    response = supabase.table("leads").insert(data).execute()

    if not response.data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Erro ao criar lead.")

    return LeadResponse(**response.data[0])


@router.patch("/{lead_id}", response_model=LeadResponse)
async def update_lead(
    lead_id: str,
    payload: LeadUpdate,
    background_tasks: BackgroundTasks,
    user=Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_supabase),
):
    """Update a lead's data."""
    update_data = payload.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nenhum campo para atualizar.")

    response = supabase.table("leads") \
        .update(update_data) \
        .eq("id", lead_id) \
        .eq("tenant_id", user.id) \
        .execute()

    if not response.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead não encontrado.")

    lead_data = response.data[0]

    # Sync with Uazapi if contact_name was updated and lead has whatsapp_chat_id
    if "contact_name" in update_data and lead_data.get("whatsapp_chat_id"):
        phone_number = lead_data["whatsapp_chat_id"].replace("@s.whatsapp.net", "").replace("@g.us", "")
        uazapi = get_uazapi_service()
        # Run in background to not block the request
        background_tasks.add_task(uazapi.update_contact, number=phone_number, name=lead_data["contact_name"])

    return LeadResponse(**lead_data)


@router.patch("/{lead_id}/stage", response_model=LeadResponse)
async def move_lead_stage(
    lead_id: str,
    payload: LeadMoveStage,
    user=Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_supabase),
):
    """Move a lead to a different Kanban column/stage."""
    response = supabase.table("leads") \
        .update({"stage": payload.stage.value}) \
        .eq("id", lead_id) \
        .eq("tenant_id", user.id) \
        .execute()

    if not response.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead não encontrado.")

    return LeadResponse(**response.data[0])


@router.delete("/{lead_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_lead(
    lead_id: str,
    user=Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_supabase),
):
    """Delete a lead."""
    supabase.table("leads").delete().eq("id", lead_id).eq("tenant_id", user.id).execute()


@router.get("/{lead_id}/messages")
async def get_lead_messages(
    lead_id: str,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user=Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_supabase),
):
    """
    Get the full chat message history for a lead (WhatsApp chat mirror).
    Returns messages sorted chronologically for display in the chat panel.
    """
    # First get the lead to find its whatsapp_chat_id
    lead_response = supabase.table("leads") \
        .select("id, company_name, contact_name, whatsapp_chat_id") \
        .eq("id", lead_id) \
        .eq("tenant_id", user.id) \
        .single() \
        .execute()

    if not lead_response.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead não encontrado.")

    lead = lead_response.data
    whatsapp_chat_id = lead.get("whatsapp_chat_id")

    if not whatsapp_chat_id:
        return {
            "lead_id": lead_id,
            "lead_name": f"{lead['contact_name']} - {lead['company_name']}",
            "whatsapp_chat_id": None,
            "messages": [],
            "total_messages": 0,
        }

    # Get messages for this chat, ordered chronologically
    messages_response = supabase.table("chat_messages") \
        .select("*", count="exact") \
        .eq("whatsapp_chat_id", whatsapp_chat_id) \
        .eq("tenant_id", user.id) \
        .order("created_at", desc=False) \
        .range(offset, offset + limit - 1) \
        .execute()

    return {
        "lead_id": lead_id,
        "lead_name": f"{lead['contact_name']} - {lead['company_name']}",
        "whatsapp_chat_id": whatsapp_chat_id,
        "messages": messages_response.data or [],
        "total_messages": messages_response.count or 0,
    }


@router.get("/{lead_id}/chat-history")
async def get_lead_chat_history(
    lead_id: str,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user=Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_supabase),
):
    """
    Get the full chat message history for a lead directly from Uazapi device.
    Returns messages fetched live from WhatsApp through the Uazapi integration.
    """
    lead_response = supabase.table("leads") \
        .select("id, company_name, contact_name, whatsapp_chat_id") \
        .eq("id", lead_id) \
        .eq("tenant_id", user.id) \
        .single() \
        .execute()

    if not lead_response.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead não encontrado.")

    lead = lead_response.data
    whatsapp_chat_id = lead.get("whatsapp_chat_id")

    if not whatsapp_chat_id:
        return {
            "lead_id": lead_id,
            "lead_name": f"{lead['contact_name']} - {lead['company_name']}",
            "whatsapp_chat_id": None,
            "messages": [],
            "hasMore": False,
        }

    # Fetch instance_token for tenant
    settings_response = supabase.table("settings") \
        .select("value") \
        .eq("key", "uazapi_instance_token") \
        .eq("tenant_id", user.id) \
        .limit(1) \
        .execute()
    
    instance_token = None
    if settings_response.data and len(settings_response.data) > 0:
        val = settings_response.data[0].get("value")
        if val:
            instance_token = val.strip('"') if isinstance(val, str) else str(val)

    # Fetch directly from Uazapi
    uazapi = get_uazapi_service()
    try:
        uazapi_response = await uazapi.find_messages(
            chatid=whatsapp_chat_id,
            limit=limit,
            offset=offset,
            instance_token=instance_token,
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Falha ao buscar histórico via Uazapi: {str(e)}",
        )

    return {
        "lead_id": lead_id,
        "lead_name": f"{lead['contact_name']} - {lead['company_name']}",
        "whatsapp_chat_id": whatsapp_chat_id,
        "messages": uazapi_response.get("messages", []),
        "returnedMessages": uazapi_response.get("returnedMessages", 0),
        "limit": uazapi_response.get("limit", limit),
        "offset": uazapi_response.get("offset", offset),
        "nextOffset": uazapi_response.get("nextOffset", None),
        "hasMore": uazapi_response.get("hasMore", False),
    }


@router.post("/{lead_id}/messages/send")
async def send_message_to_lead(
    lead_id: str,
    payload: SendMessagePayload,
    user=Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_supabase),
):
    """
    Send a WhatsApp message to a lead via Uazapi API.
    Supports text, image, video, document, and audio messages.
    The sent message is also saved in chat_messages for the chat mirror.
    """
    # Validate payload
    try:
        payload.validate_payload()
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    # Get the lead's WhatsApp chat ID
    lead_response = supabase.table("leads") \
        .select("id, company_name, contact_name, whatsapp_chat_id, tenant_id") \
        .eq("id", lead_id) \
        .eq("tenant_id", user.id) \
        .single() \
        .execute()

    if not lead_response.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead não encontrado.")

    lead = lead_response.data
    whatsapp_chat_id = lead.get("whatsapp_chat_id")

    if not whatsapp_chat_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Este lead não possui WhatsApp vinculado (whatsapp_chat_id).",
        )

    # Fetch instance_token for tenant
    settings_response = supabase.table("settings") \
        .select("value") \
        .eq("key", "uazapi_instance_token") \
        .eq("tenant_id", user.id) \
        .limit(1) \
        .execute()
    
    instance_token = None
    if settings_response.data and len(settings_response.data) > 0:
        val = settings_response.data[0].get("value")
        if val:
            instance_token = val.strip('"') if isinstance(val, str) else str(val)

    # Extract the phone number from the JID
    phone_number = whatsapp_chat_id.replace("@s.whatsapp.net", "").replace("@g.us", "")

    # Send the message via Uazapi
    uazapi = get_uazapi_service()
    uazapi_response = None

    try:
        if payload.file_url and payload.media_type:
            # Send media (optionally with caption/text)
            uazapi_response = await uazapi.send_media(
                number=phone_number,
                media_type=payload.media_type,
                file_url=payload.file_url,
                caption=payload.text or "",
                doc_name=payload.file_name,
                instance_token=instance_token,
            )
        else:
            # Send text only
            uazapi_response = await uazapi.send_text(
                number=phone_number,
                text=payload.text,
                instance_token=instance_token,
            )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Falha ao enviar mensagem via Uazapi: {str(e)}",
        )

    # Determine content type and text for saving
    content_type = payload.media_type or "text"
    content_text = payload.text or f"[{content_type.upper()}]"
    caption = payload.text if payload.file_url else None

    # Save the outgoing message to chat_messages
    message_record = {
        "whatsapp_chat_id": whatsapp_chat_id,
        "whatsapp_message_id": uazapi_response.get("messageid", "") if uazapi_response else "",
        "lead_id": lead_id,
        "tenant_id": lead.get("tenant_id"),
        "direction": "outgoing",
        "content_type": content_type,
        "content": content_text,
        "media_url": payload.file_url,
        "media_mimetype": None,
        "media_filename": payload.file_name,
        "caption": caption,
        "sender_name": "CRM Neurix",
        "sender_phone": "",
    }
    # Remove None values
    message_record = {k: v for k, v in message_record.items() if v is not None}

    try:
        saved = supabase.table("chat_messages").insert(message_record).execute()
    except Exception as e:
        # Message was sent but failed to save — log but don't error
        print(f"⚠️ Message sent but failed to save: {e}")
        saved = None

    return {
        "status": "sent",
        "message": "Mensagem enviada com sucesso.",
        "uazapi_response": uazapi_response,
        "saved_message": saved.data[0] if saved and saved.data else message_record,
    }
