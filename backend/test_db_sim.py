import asyncio
import httpx

url = "https://crmneurix-pre0225supabase-eb4832-187-77-35-167.traefik.me/rest/v1"
key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJzZXJ2aWNlX3JvbGUiLAogICAgImlzcyI6ICJzdXBhYmFzZS1kZW1vIiwKICAgICJpYXQiOiAxNjQxNzY5MjAwLAogICAgImV4cCI6IDE3OTk1MzU2MDAKfQ.DaYlNEoUrrEn2Ig7tqibS-PHK5vgusbcbo7X36XVt4Q"

headers = {
    "apikey": key,
    "Authorization": f"Bearer {key}",
    "Content-Type": "application/json",
    "Prefer": "return=representation"
}

async def main():
    print("Testing payload directly against Supabase REST API...")
    async with httpx.AsyncClient(verify=False) as client:
        try:
            # Step 1: Query lead
            chat_id = "554195802989@s.whatsapp.net"
            
            print("Checking if lead exists...")
            resp = await client.get(f"{url}/leads?whatsapp_chat_id=eq.{chat_id}&select=id,stage,tenant_id", headers=headers)
            resp.raise_for_status()
            lead_data = resp.json()
            
            if lead_data:
                print("Lead exists:", lead_data[0])
            else:
                print("Lead does not exist. Attempting creation...")
                
                # Step 2: Get tenant id
                p_resp = await client.get(f"{url}/profiles?role=eq.admin&select=id&limit=1", headers=headers)
                p_data = p_resp.json()
                if p_data:
                    tenant_id = p_data[0]["id"]
                else:
                    p_resp = await client.get(f"{url}/profiles?select=id&limit=1", headers=headers)
                    p_data = p_resp.json()
                    tenant_id = p_data[0]["id"] if p_data else None
                    
                print(f"Tenant ID found: {tenant_id}")
                
                # Step 3: Insert Lead
                new_lead = {
                    "tenant_id": tenant_id,
                    "whatsapp_chat_id": chat_id,
                    "contact_name": "Augusto",
                    "company_name": "Novo Lead",
                    "stage": "",
                    "value": 0
                }
                
                insert_resp = await client.post(f"{url}/leads", headers=headers, json=new_lead)
                if insert_resp.status_code >= 400:
                    print("Error creating lead:", insert_resp.status_code, insert_resp.text)
                else:
                    print("Lead created successfully!", insert_resp.json())

        except Exception as e:
            print(f"Exception happened: {e}")

if __name__ == "__main__":
    asyncio.run(main())
