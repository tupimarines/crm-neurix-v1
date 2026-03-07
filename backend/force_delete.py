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
        print(f"--- Deleting Messages for {chat_id} ---")
        m_resp = await client.delete(f"{url}/chat_messages?whatsapp_chat_id=eq.{chat_id}", headers=headers)
        if m_resp.status_code >= 400:
            print("Error deleting messages:", m_resp.text)
        else:
            print("Messages deleted successfully!")
            
        print(f"--- Deleting Lead for {chat_id} ---")
        l_resp = await client.delete(f"{url}/leads?whatsapp_chat_id=eq.{chat_id}", headers=headers)
        if l_resp.status_code >= 400:
            print("Error deleting lead:", l_resp.text)
        else:
            print("Lead deleted successfully!")

if __name__ == "__main__":
    asyncio.run(main())
