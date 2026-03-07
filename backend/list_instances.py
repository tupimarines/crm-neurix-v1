import asyncio
import os
import sys
import httpx

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.services.uazapi_service import UazapiService

async def main():
    uazapi = UazapiService()
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"{uazapi.base_url}/instance/all",
                headers=uazapi._admin_headers(),
            )
            data = resp.json()
            if isinstance(data, list):
                for instance in data:
                    print(f"Name: {instance.get('name', 'Unknown')}")
                    print(f"Token: {instance.get('token', 'Unknown')}")
                    print(f"Status: {instance.get('status', 'Unknown')}")
                    print("-" * 20)
            else:
                print(data)
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(main())
