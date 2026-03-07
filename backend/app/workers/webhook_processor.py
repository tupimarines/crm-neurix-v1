"""
Webhook Processor Worker — Consumes events from the Redis queue.
Processes Uazapi (WhatsApp) events: saves messages (text + media), detects keywords, moves leads.
"""

import asyncio
import json
import redis.asyncio as aioredis
from app.config import get_settings
from app.services.keyword_engine import keyword_engine


def _extract_content_type(message_data: dict) -> tuple[str, str, str | None, str | None, str | None]:
    """
    Extract content type, text content, and media info from a Uazapi message.
    Returns: (content_type, content_text, media_url, media_mimetype, media_filename)
    """
    msg = message_data.get("message", {})

    # Text message
    if "conversation" in msg:
        return "text", msg["conversation"], None, None, None
    if "extendedTextMessage" in msg:
        return "text", msg["extendedTextMessage"].get("text", ""), None, None, None

    # Image
    if "imageMessage" in msg:
        img = msg["imageMessage"]
        media_url = message_data.get("fileURL") or img.get("url")
        return "image", img.get("caption", ""), media_url, img.get("mimetype"), None

    # Video
    if "videoMessage" in msg:
        vid = msg["videoMessage"]
        media_url = message_data.get("fileURL") or vid.get("url")
        return "video", vid.get("caption", ""), media_url, vid.get("mimetype"), None

    # Audio / Voice note
    if "audioMessage" in msg:
        aud = msg["audioMessage"]
        media_url = message_data.get("fileURL") or aud.get("url")
        return "audio", "", media_url, aud.get("mimetype"), None

    # Document
    if "documentMessage" in msg:
        doc = msg["documentMessage"]
        media_url = message_data.get("fileURL") or doc.get("url")
        return "document", doc.get("caption", ""), media_url, doc.get("mimetype"), doc.get("fileName")

    # Sticker
    if "stickerMessage" in msg:
        stk = msg["stickerMessage"]
        media_url = message_data.get("fileURL") or stk.get("url")
        return "sticker", "", media_url, stk.get("mimetype"), None

    # Reaction
    if "reactionMessage" in msg:
        react = msg["reactionMessage"]
        return "reaction", react.get("text", ""), None, None, None

    # Location
    if "locationMessage" in msg:
        loc = msg["locationMessage"]
        content = f"{loc.get('degreesLatitude', 0)},{loc.get('degreesLongitude', 0)}"
        return "location", content, None, None, None

    # Contact
    if "contactMessage" in msg:
        contact = msg["contactMessage"]
        return "contact", contact.get("displayName", ""), None, None, None

    # Fallback
    return "text", str(msg), None, None, None


async def log_error_to_redis(redis_client, msg: str):
    import time
    err_event = f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {msg}"
    print(err_event)
    try:
        await redis_client.lpush("neurix:webhook_errors", err_event)
        await redis_client.ltrim("neurix:webhook_errors", 0, 49) # keep last 50
    except:
        pass

async def process_uazapi_event(event: dict, supabase_client, redis_client):
    """Process a single Uazapi webhook event."""
    payload = event.get("payload", {})
    await log_error_to_redis(redis_client, f"START process_uazapi_event. EventType: {payload.get('EventType')}")
    
    # ── Handle New Uazapi Format ──
    if payload.get("EventType") == "messages":
        message_data = payload.get("message", {})
        chat_id = message_data.get("chatid", "")
        msg_id = message_data.get("messageid", "")
        is_from_me = message_data.get("fromMe", False)
        
        await log_error_to_redis(redis_client, f"Parsed message fields: chat_id={chat_id}, is_from_me={is_from_me}, isGroup={message_data.get('isGroup')}")
        
        # Ignore invalid or group chats
        if not chat_id or "@g.us" in chat_id or message_data.get("isGroup"):
            await log_error_to_redis(redis_client, "RETURN: Invalid chat or group chat")
            return
            
        content_type = message_data.get("type", "text")
        content_text = message_data.get("text", message_data.get("content", ""))
        media_url = None # Needs adaptation if Uazapi v2 sends file urls differently
        media_mimetype = message_data.get("mediaType", None)
        media_filename = None
        
        sender_name = message_data.get("senderName", "")
        sender_phone = chat_id.replace("@s.whatsapp.net", "").replace("@g.us", "")

    # ── Handle Old Baileys Format ──
    elif payload.get("event") == "messages.upsert":
        await log_error_to_redis(redis_client, "Parsed as old Baileys format.")
        message_data = payload.get("data", {})
        chat_id = message_data.get("key", {}).get("remoteJid", "")
        msg_id = message_data.get("key", {}).get("id", "")
        is_from_me = message_data.get("key", {}).get("fromMe", False)

        if not chat_id or "@g.us" in chat_id:
            await log_error_to_redis(redis_client, "RETURN: Invalid chat or group chat (Old Format)")
            return

        content_type, content_text, media_url, media_mimetype, media_filename = _extract_content_type(message_data)
        
        sender_name = message_data.get("pushName", "")
        sender_phone = chat_id.replace("@s.whatsapp.net", "").replace("@g.us", "")
    else:
        # Unknown event type
        await log_error_to_redis(redis_client, f"RETURN: Unknown event type: {payload.get('EventType')} / {payload.get('event')}")
        return

    # Get caption if available
    caption = None
    if content_type in ("image", "video", "document"):
        caption = content_text or None
        if not content_text:
            content_text = f"[{content_type.upper()}]"

    # Find lead associated with this chat
    lead_id = None
    lead_data = None
    await log_error_to_redis(redis_client, f"Querying Supabase for lead with whatsapp_chat_id={chat_id}")
    try:
        lead_response = supabase_client.table("leads") \
            .select("id, stage, tenant_id") \
            .eq("whatsapp_chat_id", chat_id) \
            .single() \
            .execute()
        if lead_response.data:
            lead_id = lead_response.data["id"]
            lead_data = lead_response.data
    except Exception as e:
        # Expected PGRST116 (No rows) if lead does not exist
        if "PGRST116" not in str(e):
             await log_error_to_redis(redis_client, f"Error finding lead: {e}")

    if not lead_data and not is_from_me:
        await log_error_to_redis(redis_client, "No lead data. Creating a new lead!")
        # Find the correct tenant_id using the instance_token from the payload
        tenant_id = None
        instance_token = payload.get("token") or event.get("token")
        
        try:
            if instance_token:
                # Look up the tenant_id from settings using the instance_token
                setting_resp = supabase_client.table("settings").select("tenant_id").eq("key", "uazapi_instance_token").eq("value", instance_token).limit(1).execute()
                if setting_resp.data:
                    tenant_id = setting_resp.data[0]["tenant_id"]
                    await log_error_to_redis(redis_client, f"Found tenant_id {tenant_id} via instance_token match.")
            
            # Fallback to the old logic ONLY IF we still don't have a tenant_id
            if not tenant_id:
                await log_error_to_redis(redis_client, "Webhook Token not matched in Settings. Falling back to admin profile.")
                profile_resp = supabase_client.table("profiles").select("id").eq("role", "admin").limit(1).execute()
                if profile_resp.data:
                    tenant_id = profile_resp.data[0]["id"]
                else:
                    profile_resp = supabase_client.table("profiles").select("id").limit(1).execute()
                    if profile_resp.data:
                        tenant_id = profile_resp.data[0]["id"]
                        
                if not tenant_id:
                    await log_error_to_redis(redis_client, "Critical: No profiles found to assign tenant_id to new webhook lead.")
        except Exception as e:
            await log_error_to_redis(redis_client, f"Failed to query tenant mapping: {e}")

        if tenant_id:
            try:
                new_lead = {
                    "tenant_id": tenant_id,
                    "whatsapp_chat_id": chat_id,
                    "contact_name": sender_name or sender_phone or "Desconhecido",
                    "company_name": sender_name or sender_phone or "Novo Lead",
                    "stage": "contato_inicial",
                    "value": 0
                }
                await log_error_to_redis(redis_client, f"Inserting lead: {new_lead}")
                lead_insert = supabase_client.table("leads").insert(new_lead).execute()
                if lead_insert.data:
                    lead_id = lead_insert.data[0]["id"]
                    lead_data = lead_insert.data[0]
                    await log_error_to_redis(redis_client, f"Created new Lead from Uazapi: {lead_id}")
            except Exception as e:
                await log_error_to_redis(redis_client, f"Failed to create new lead: {e}")
    elif is_from_me:
        await log_error_to_redis(redis_client, "is_from_me is True. Not creating lead.")
    else:
        await log_error_to_redis(redis_client, "Lead already exists!")

    # Save the message to chat_messages table
    try:
        message_record = {
            "whatsapp_chat_id": chat_id,
            "whatsapp_message_id": msg_id,
            "lead_id": lead_id,
            "tenant_id": lead_data.get("tenant_id") if lead_data else None,
            "direction": "outgoing" if is_from_me else "incoming",
            "content_type": content_type,
            "content": content_text,
            "media_url": media_url,
            "media_mimetype": media_mimetype,
            "media_filename": media_filename,
            "caption": caption,
            "sender_name": sender_name,
            "sender_phone": sender_phone,
            "metadata": {"type": "v2_webhook"},
        }
        # Remove None values
        message_record = {k: v for k, v in message_record.items() if v is not None}
        supabase_client.table("chat_messages").insert(message_record).execute()
        # await log_error_to_redis(redis_client, f"Saved message {msg_id}") # Debug success
    except Exception as e:
        await log_error_to_redis(redis_client, f"Failed to save message: {e}")

    # Only analyze incoming text messages for keyword detection
    if is_from_me or content_type != "text" or not content_text:
        return

    if not lead_id or not lead_data:
        return

    # Load rules from DB and run keyword engine
    try:
        rules = await keyword_engine.load_rules_from_db(supabase_client)
        suggested_stage = keyword_engine.analyze_message(content_text, rules)

        if not suggested_stage:
            return

        # Only move forward, never backward in the funnel
        stage_order = {
            "contato_inicial": 0,
            "escolhendo_sabores": 1,
            "aguardando_pagamento": 2,
            "enviado": 3,
        }
        current_order = stage_order.get(lead_data["stage"], 0)
        suggested_order = stage_order.get(suggested_stage.value, 0)

        if suggested_order > current_order:
            supabase_client.table("leads") \
                .update({"stage": suggested_stage.value}) \
                .eq("id", lead_data["id"]) \
                .execute()
            await log_error_to_redis(redis_client, f"Lead {lead_data['id']} moved: {lead_data['stage']} -> {suggested_stage.value}")
    except Exception as e:
         await log_error_to_redis(redis_client, f"Failed keyword engine / moving lead: {e}")


async def worker_loop():
    """Main worker loop — continuously reads from Redis queue."""
    settings = get_settings()
    redis_client = aioredis.from_url(settings.redis_url, decode_responses=True)

    from supabase import create_client
    supabase_client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)
    
    await log_error_to_redis(redis_client, "Webhook processor worker started properly.")

    while True:
        try:
            result = await redis_client.blpop("neurix:webhook_queue", timeout=5)
            if result is None:
                continue

            _, raw_event = result
            event = json.loads(raw_event)
            source = event.get("source", "unknown")

            if source == "uazapi":
                await process_uazapi_event(event, supabase_client, redis_client)
            elif source == "invoice":
                pass
            else:
                await log_error_to_redis(redis_client, f"Unknown webhook source: {source}")

        except Exception as e:
            await log_error_to_redis(redis_client, f"Worker loop error: {e}")
            await asyncio.sleep(2)

if __name__ == "__main__":
    asyncio.run(worker_loop())
