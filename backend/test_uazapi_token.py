import asyncio
import httpx

async def main():
    token = "5c8ab722-0e93-4533-9906-5bb946bf4eb3"
    print(f"Testing with token: {token}")
    
    headers = {"apikey": token, "Content-Type": "application/json"}
    
    async with httpx.AsyncClient() as client:
        # Test 1: instance status
        print("Testing /instance/status...")
        r1 = await client.get("https://neurix.uazapi.com/instance/status", headers=headers)
        print(f"Status: {r1.status_code}")
        try:
            print(r1.json())
        except Exception:
            print(r1.text)
            
        # Test 2: list instances (needs admin token maybe? or instance token works?)
        # Let's try /message/find just to see if 401
        print("\nTesting /message/find...")
        r2 = await client.post("https://neurix.uazapi.com/message/find", headers=headers, json={"limit": 1})
        print(f"Status: {r2.status_code}")
        try:
            print(r2.json())
        except Exception:
            print(r2.text)

if __name__ == "__main__":
    asyncio.run(main())
