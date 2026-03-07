import asyncio
import os
import sys

# Add backend directory to path so we can import app modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.services.uazapi_service import UazapiService
from app.config import get_settings

async def main():
    uazapi = UazapiService()
    settings = get_settings()
    
    # We use the known production URL
    url = "https://crm.wbtech.dev/api/webhooks/uazapi"
    
    # If the user configured a secret, append it to the URL query string
    if settings.UAZAPI_WEBHOOK_SECRET:
        url += f"?secret={settings.UAZAPI_WEBHOOK_SECRET}"
    
    print(f"Setting global webhook to: {url}")
    
    payload = {
        "url": url,
        "events": ["messages"],
        "excludeMessages": ["wasSentByApi"]
    }
    
    import httpx
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                f"{uazapi.base_url}/webhook/global",
                json=payload,
                headers=uazapi._admin_headers(),
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
