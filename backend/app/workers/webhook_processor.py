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


async def process_uazapi_event(event: dict, supabase_client):
    """Process a single Uazapi webhook event."""
    payload = event.get("payload", {})
    message_data = payload.get("data", {})
    chat_id = message_data.get("key", {}).get("remoteJid", "")
    is_from_me = message_data.get("key", {}).get("fromMe", False)
    msg_id = message_data.get("key", {}).get("id", "")

    if not chat_id:
        return

    # Extract content type and media info
    content_type, content_text, media_url, media_mimetype, media_filename = _extract_content_type(message_data)

    # Extract sender info
    sender_name = message_data.get("pushName", "")
    sender_phone = chat_id.replace("@s.whatsapp.net", "").replace("@g.us", "")

    # Get caption if available
    caption = None
    if content_type in ("image", "video", "document"):
        caption = content_text or None
        if not content_text:
            content_text = f"[{content_type.upper()}]"

    # Find lead associated with this chat
    lead_id = None
    lead_data = None
    try:
        lead_response = supabase_client.table("leads") \
            .select("id, stage, tenant_id") \
            .eq("whatsapp_chat_id", chat_id) \
            .single() \
            .execute()
        if lead_response.data:
            lead_id = lead_response.data["id"]
            lead_data = lead_response.data
    except Exception:
        pass

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
            "metadata": message_data.get("message", {}),
        }
        # Remove None values
        message_record = {k: v for k, v in message_record.items() if v is not None}
        supabase_client.table("chat_messages").insert(message_record).execute()
    except Exception as e:
        print(f"⚠️ Failed to save message: {e}")

    # Only analyze incoming text messages for keyword detection
    if is_from_me or content_type != "text" or not content_text:
        return

    if not lead_id or not lead_data:
        return

    # Load rules from DB and run keyword engine
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
        try:
            supabase_client.table("leads") \
                .update({"stage": suggested_stage.value}) \
                .eq("id", lead_data["id"]) \
                .execute()
            print(f"✅ Lead {lead_data['id']} moved: {lead_data['stage']} → {suggested_stage.value}")
        except Exception as e:
            print(f"⚠️ Failed to move lead: {e}")


async def worker_loop():
    """Main worker loop — continuously reads from Redis queue."""
    settings = get_settings()
    redis_client = aioredis.from_url(settings.redis_url, decode_responses=True)

    from supabase import create_client
    supabase_client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)

    print("🔄 Webhook processor worker started. Listening on neurix:webhook_queue...")

    while True:
        try:
            result = await redis_client.blpop("neurix:webhook_queue", timeout=5)
            if result is None:
                continue

            _, raw_event = result
            event = json.loads(raw_event)
            source = event.get("source", "unknown")

            if source == "uazapi":
                await process_uazapi_event(event, supabase_client)
            elif source == "invoice":
                print(f"📄 Invoice webhook received (not yet implemented)")
            else:
                print(f"❓ Unknown webhook source: {source}")

        except Exception as e:
            print(f"❌ Worker error: {e}")
            await asyncio.sleep(2)


if __name__ == "__main__":
    asyncio.run(worker_loop())
