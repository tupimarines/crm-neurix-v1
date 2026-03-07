import os
from supabase import create_client

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
supabase = create_client(url, key)

res = supabase.table("settings").select("*").eq("key", "uazapi_instance_token").execute()
print("Settings records for uazapi_instance_token:")
for r in res.data:
    print(f"Tenant: {r['tenant_id']}, Value: {repr(r['value'])}, Type: {type(r['value'])}")
