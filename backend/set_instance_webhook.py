import asyncio
import os
import sys
import httpx

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.services.uazapi_service import UazapiService
from app.config import get_settings

async def main():
    uazapi = UazapiService()
    settings = get_settings()
    
    url = "https://crm.wbtech.dev/api/webhooks/uazapi"
    if settings.UAZAPI_WEBHOOK_SECRET:
        url += f"?secret={settings.UAZAPI_WEBHOOK_SECRET}"
    
    print(f"Setting instance webhook to: {url}")
    
    payload = {
        "url": url,
        "events": ["messages"],
        "excludeMessages": ["wasSentByApi"]
    }
    
    instance_token = "5c8ab722-0e93-4533-9906-5bb946bf4eb3"
        
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                f"{uazapi.base_url}/webhook",
                json=payload,
                headers={"apikey": instance_token, "Content-Type": "application/json"},
            )
            print("Response:", resp.status_code)
            try:
                print(resp.json())
            except:
                print(resp.text)
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(main())
