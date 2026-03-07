import asyncio
import httpx
from app.config import get_settings

async def main():
    settings = get_settings()
    global_apikey = settings.UAZAPI_ADMIN_TOKEN
    manual_token = "5c8ab722-0e93-4533-9906-5bb946bf4eb3"
    
    print(f"Global API Key (Admin): {global_apikey}")
    print(f"Manual Token (Instance): {manual_token}")
    
    async with httpx.AsyncClient() as client:
        print("\n--- Test A: Instance Status with manual_token ---")
        headers_instance = {"token": manual_token, "Content-Type": "application/json"}
        try:
            r1 = await client.get("https://neurix.uazapi.com/instance/status", headers=headers_instance)
            print(f"Status: {r1.status_code}")
            print(r1.text[:200])
        except Exception as e:
            print(f"Error: {e}")

        print("\n--- Test B: Find Messages with manual_token ---")
        try:
            payload = {
                "limit": 10
            }
            r2 = await client.post("https://neurix.uazapi.com/message/find", json=payload, headers=headers_instance)
            print(f"Status: {r2.status_code}")
            print(r2.text[:200])
        except Exception as e:
            print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(main())
