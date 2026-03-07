import asyncio
import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.supabase import supabase_client

def main():
    try:
        response = supabase_client.table("whatsapp_config").select("instance_token").limit(1).execute()
        if response.data:
            print("TOKEN:", response.data[0]["instance_token"])
        else:
            print("No config found")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()
