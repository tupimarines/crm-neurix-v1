# check_db.py
import asyncio
from supabase import create_client, ClientOptions

url = "http://crmneurix-pre0225supabase-eb4832-187-77-35-167.traefik.me"
key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJzZXJ2aWNlX3JvbGUiLAogICAgImlzcyI6ICJzdXBhYmFzZS1kZW1vIiwKICAgICJpYXQiOiAxNjQxNzY5MjAwLAogICAgImV4cCI6IDE3OTk1MzU2MDAKfQ.DaYlNEoUrrEn2Ig7tqibS-PHK5vgusbcbo7X36XVt4Q"

supabase_client = create_client(url, key, options=ClientOptions(headers={"Accept": "*/*"}))

import httpx
supabase_client.rest_url = "https://crmneurix-pre0225supabase-eb4832-187-77-35-167.traefik.me/rest/v1"
class FakeHttpxClient(httpx.Client):
    def __init__(self, *args, **kwargs):
        kwargs["verify"] = False
        super().__init__(*args, **kwargs)

import postgrest
postgrest.constants.DEFAULT_POSTGREST_CLIENT_HEADERS.update({"Accept": "*/*"})
postgrest.SyncClient._client = property(lambda self: FakeHttpxClient())
supabase_client.table = supabase_client.from_

async def main():
    chat_id = "554195802989@s.whatsapp.net"
    print(f"--- Checking Lead for {chat_id} ---")
    resp = supabase_client.table("leads").select("*").eq("whatsapp_chat_id", chat_id).execute()
    if resp.data:
        print(f"FOUND {len(resp.data)} LEAD(S):")
        for l in resp.data:
            print(f"- ID: {l['id']}, Name: {l.get('contact_name')}, Stage: {l.get('stage')}")
    else:
        print("NO LEAD FOUND.")

    print(f"\n--- Checking Messages for {chat_id} ---")
    msg_resp = supabase_client.table("chat_messages").select("id, content, created_at").eq("whatsapp_chat_id", chat_id).order("created_at", desc=True).limit(5).execute()
    if msg_resp.data:
        print(f"FOUND {len(msg_resp.data)} RECENT MESSAGE(S):")
        for m in msg_resp.data:
            print(f" - [{m['created_at']}] {m['content']}")
    else:
        print("NO MESSAGES FOUND in chat_messages.")

if __name__ == "__main__":
    asyncio.run(main())
