import asyncio
import httpx
import json

from app.workers.webhook_processor import process_uazapi_event

class MockRedis:
    def __init__(self):
        self.q = []
    async def lpush(self, k, v):
        self.q.append(v)
        print("REDIS ERROR LOG PUSHED:", v)
    async def ltrim(self, *args):
        pass

from supabase import create_client, ClientOptions

url = "https://crmneurix-pre0225supabase-eb4832-187-77-35-167.traefik.me/rest/v1"
key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJzZXJ2aWNlX3JvbGUiLAogICAgImlzcyI6ICJzdXBhYmFzZS1kZW1vIiwKICAgICJpYXQiOiAxNjQxNzY5MjAwLAogICAgImV4cCI6IDE3OTk1MzU2MDAKfQ.DaYlNEoUrrEn2Ig7tqibS-PHK5vgusbcbo7X36XVt4Q"

supabase_client = create_client(url, key, options=ClientOptions(headers={"Accept": "*/*"}))

class FakeHttpxClient(httpx.Client):
    def __init__(self, *args, **kwargs):
        kwargs["verify"] = False
        super().__init__(*args, **kwargs)

import postgrest
postgrest.constants.DEFAULT_POSTGREST_CLIENT_HEADERS.update({"Accept": "*/*"})
postgrest.SyncClient._client = property(lambda self: FakeHttpxClient())

supabase_client.rest_url = "https://crmneurix-pre0225supabase-eb4832-187-77-35-167.traefik.me/rest/v1"
supabase_client.table = supabase_client.from_

payload = {
  "BaseUrl": "https://neurix.uazapi.com",
  "EventType": "messages",
  "chat": {
    "chatbot_agentResetMemoryAt": 0,
    "chatbot_disableUntil": 0,
    "chatbot_lastTriggerAt": 0,
    "chatbot_lastTrigger_id": "",
    "id": "r1bcc7fa04faee3",
    "image": "",
    "lead_isTicketOpen": False,
    "lead_kanbanOrder": 0,
    "name": "Augusto",
    "owner": "554197889864",
    "phone": "+55 41 9580-2989",
    "wa_archived": False,
    "wa_chatid": "554195802989@s.whatsapp.net",
    "wa_contactName": "Augusto",
    "wa_isBlocked": False,
    "wa_isGroup": False,
  },
  "chatSource": "updated",
  "instanceName": "crm_neurix-9864",
  "message": {
    "buttonOrListid": "",
    "chatid": "554195802989@s.whatsapp.net",
    "chatlid": "",
    "content": "olar3",
    "fromMe": False,
    "groupName": "Unknown",
    "id": "554197889864:3EB07D894EDFD7A1CB6921",
    "isGroup": False,
    "mediaType": "",
    "messageTimestamp": 1772887067000,
    "messageType": "Conversation",
    "messageid": "3EB07D894EDFD7A1CB6921",
    "owner": "554197889864",
    "sender": "554195802989@s.whatsapp.net",
    "senderName": "Augusto",
    "sender_pn": "554195802989@s.whatsapp.net",
    "source": "web",
    "text": "olar3",
    "type": "text",
    "wasSentByApi": False
  },
  "owner": "554197889864"
}

async def main():
    r = MockRedis()
    event = {"source": "uazapi", "payload": payload}
    print("starting processing")
    await process_uazapi_event(event, supabase_client, r)
    print("done.")

if __name__ == "__main__":
    asyncio.run(main())
