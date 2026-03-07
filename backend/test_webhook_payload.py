import asyncio
import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.workers.webhook_processor import process_uazapi_event
from app.supabase import supabase_client

test_event = {
    "source": "uazapi",
    "payload": {
        "BaseUrl": "https://neurix.uazapi.com",
        "EventType": "messages",
        "chat": {
            "id": "r1bcc7fa04faee3",
            "name": "Augusto",
            "phone": "+55 41 9580-2989",
            "wa_chatid": "554195802989@s.whatsapp.net",
            "wa_contactName": "Augusto",
            "wa_isGroup": False
        },
        "instanceName": "crm_neurix-9864",
        "message": {
            "chatid": "554195802989@s.whatsapp.net",
            "content": "ola",
            "fromMe": False,
            "isGroup": False,
            "messageType": "Conversation",
            "senderName": "Augusto",
            "sender_pn": "554195802989@s.whatsapp.net",
            "text": "ola",
            "type": "text",
            "wasSentByApi": False,
            "messageid": "3EB024AE112ADF2BEF7817"
        }
    }
}

async def main():
    print("Testing payload...")
    try:
        await process_uazapi_event(test_event, supabase_client)
        print("Test complete.")
    except Exception as e:
        print(f"Exception happened: {e}")

if __name__ == "__main__":
    asyncio.run(main())
