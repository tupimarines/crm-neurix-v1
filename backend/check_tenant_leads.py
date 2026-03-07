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
    tenant_id = "73059f44-3c0b-4b97-bf0d-cd7da709db2e"
    print(f"--- Fetching Leads for tenant {tenant_id} ---")
    async with httpx.AsyncClient(verify=False) as client:
        resp = await client.get(f"{url}/leads?tenant_id=eq.{tenant_id}", headers=headers)
        if resp.status_code >= 400:
            print("Error fetching leads:", resp.text)
        else:
            data = resp.json()
            print(f"Found {len(data)} leads.")
            for d in data:
                print(f"Lead ID: {d.get('id')} - Name: {d.get('contact_name')} - Stage: {d.get('stage')} - Arch: {d.get('archived')} - Del: {d.get('deleted')}")

if __name__ == "__main__":
    asyncio.run(main())
