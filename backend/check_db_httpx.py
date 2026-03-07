import asyncio
import httpx
import json

url = "https://crmneurix-pre0225supabase-eb4832-187-77-35-167.traefik.me/rest/v1"
key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJzZXJ2aWNlX3JvbGUiLAogICAgImlzcyI6ICJzdXBhYmFzZS1kZW1vIiwKICAgICJpYXQiOiAxNjQxNzY5MjAwLAogICAgImV4cCI6IDE3OTk1MzU2MDAKfQ.DaYlNEoUrrEn2Ig7tqibS-PHK5vgusbcbo7X36XVt4Q"

headers = {
    "apikey": key,
    "Authorization": f"Bearer {key}",
    "Content-Type": "application/json",
    "Prefer": "return=representation"
}

async def main():
    chat_id = "554195802989@s.whatsapp.net"
    async with httpx.AsyncClient(verify=False) as client:
        print(f"--- Checking Lead for {chat_id} ---")
        resp = await client.get(f"{url}/leads?whatsapp_chat_id=eq.{chat_id}&select=id,stage,tenant_id,contact_name", headers=headers)
        if resp.status_code >= 400:
            print("Error", resp.text)
        else:
            data = resp.json()
            if data:
                print(f"FOUND {len(data)} LEAD(S):")
                for l in data:
                    print(f"- ID: {l['id']}, Name: {l.get('contact_name')}, Stage: {l.get('stage')}")
            else:
                print("NO LEAD FOUND.")

        print(f"\n--- Checking Messages for {chat_id} ---")
        resp2 = await client.get(f"{url}/chat_messages?whatsapp_chat_id=eq.{chat_id}&select=id,content,created_at&order=created_at.desc&limit=5", headers=headers)
        if resp2.status_code >= 400:
            print("Error", resp2.text)
        else:
            data2 = resp2.json()
            if data2:
                print(f"FOUND {len(data2)} RECENT MESSAGE(S):")
                for m in data2:
                    print(f" - [{m['created_at']}] {m['content']}")
            else:
                print("NO MESSAGES FOUND in chat_messages.")

if __name__ == "__main__":
    asyncio.run(main())
