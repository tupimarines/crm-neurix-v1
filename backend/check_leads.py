import asyncio
import os
import sys
import httpx

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from app.config import get_settings

async def main():
    settings = get_settings()
    supabase_url = "https://crm-supabase.wbtech.dev"
    supabase_key = settings.SUPABASE_SERVICE_ROLE_KEY
    
    headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}"
    }
    
    async with httpx.AsyncClient() as client:
        resp = await client.get(f"{supabase_url}/rest/v1/leads?select=id,contact_name,company_name,created_at&order=created_at.desc&limit=10", headers=headers)
        if resp.status_code == 200:
            for lead in resp.json():
                print(f"[{lead['created_at']}] ID: {lead['id']} | Name: {lead['contact_name']} | Company: {lead['company_name']}")
        else:
            print(resp.status_code, resp.text)

if __name__ == "__main__":
    asyncio.run(main())
