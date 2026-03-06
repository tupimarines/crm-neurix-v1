"""
WhatsApp Integration Router
Handles Uazapi instance management directly from the CRM UI.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from supabase import Client as SupabaseClient

from app.dependencies import get_supabase, get_current_user
from app.services.uazapi_service import UazapiService

router = APIRouter()
uazapi = UazapiService()


class ConnectRequest(BaseModel):
    instance_name: str


class TokenRequest(BaseModel):
    instance_token: str


@router.get("/status")
async def get_status(
    user=Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_supabase),
):
    """Get the current connection status of the WhatsApp instance."""
    # Fetch token from settings
    response = supabase.table("settings").select("value").eq("tenant_id", user.id).eq("key", "uazapi_instance_token").execute()
    
    if not response.data:
        return {"status": "disconnected", "message": "Nenhum token configurado."}
    
    instance_token = response.data[0]["value"]
    
    try:
        status_data = await uazapi.get_instance_status(instance_token=instance_token)
        
        # Uazapi pode retornar o status em vários lugares dependendo da versão (Evolution/Waha/CodeChat)
        instance_state = "unknown"
        if "instance" in status_data:
            instance_state = status_data["instance"].get("state", status_data["instance"].get("status", "unknown"))
        elif "state" in status_data:
            instance_state = status_data["state"]
        elif "status" in status_data:
            instance_state = status_data["status"]
            
        return {"status": instance_state, "data": status_data}
    except Exception as e:
        return {"status": "error", "message": f"Erro ao consultar Uazapi: {str(e)}"}


@router.post("/init")
async def init_instance_route(
    payload: ConnectRequest,
    user=Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_supabase),
):
    """Initializes a new instance in Uazapi and saves its token."""
    instance_name = payload.instance_name
    instance_token = None
    
    # 1. Fetch existing instances to avoid re-creating or losing the token
    try:
        instances = await uazapi.list_instances()
        for inst in instances:
            inst_name = inst.get("instance", {}).get("instanceName", inst.get("name", ""))
            if inst_name == instance_name:
                instance_token = inst.get("instance", {}).get("token", inst.get("token", ""))
                break
    except Exception as e:
        print(f"Error listing instances: {e}")

    # 2. If no token found, init new instance
    if not instance_token:
        try:
            init_res = await uazapi.init_instance(name=instance_name)
            instance_token = init_res.get("token", instance_name)
            if "instance" in init_res and "token" in init_res["instance"]:
                instance_token = init_res["instance"]["token"]
        except Exception as e:
            print(f"Error init_instance: {e}")
            raise HTTPException(status_code=500, detail=f"Erro ao inicializar instância Uazapi: {e}")

    if not instance_token:
        raise HTTPException(status_code=400, detail="Não foi possível obter ou criar um token para a instância.")
            
    # 3. Save token to DB
    supabase.table("settings").upsert({
        "tenant_id": user.id,
        "key": "uazapi_instance_token",
        "value": instance_token
    }, on_conflict="tenant_id,key").execute()
    
    return {"message": "Instância inicializada", "token": instance_token}


@router.post("/connect")
async def connect_instance(
    user=Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_supabase),
):
    """Generate QR code / start connection for an already initialized instance."""
    response = supabase.table("settings").select("value").eq("tenant_id", user.id).eq("key", "uazapi_instance_token").execute()
    if not response.data:
        raise HTTPException(status_code=400, detail="Nenhum token configurado. Crie uma instância primeiro.")
        
    instance_token = response.data[0]["value"]
    
    try:
        connect_data = await uazapi.connect_instance(instance_token=instance_token)
        return {"message": "Connection initiated", "data": connect_data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao conectar: {str(e)}")


@router.post("/token")
async def save_manual_token(
    payload: TokenRequest,
    user=Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_supabase),
):
    """Save an existing instance token manually."""
    response = supabase.table("settings").upsert({
        "tenant_id": user.id,
        "key": "uazapi_instance_token",
        "value": payload.instance_token
    }, on_conflict="tenant_id,key").execute()
    
    if not response.data:
        raise HTTPException(status_code=400, detail="Erro ao salvar token.")
        
    return {"message": "Token salvo com sucesso", "status": "saved"}


@router.delete("/disconnect")
async def disconnect_instance(
    user=Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_supabase),
):
    """Disconnect the instance and remove its token from settings."""
    # Get current token
    response = supabase.table("settings").select("value").eq("tenant_id", user.id).eq("key", "uazapi_instance_token").execute()
    if response.data:
        instance_token = response.data[0]["value"]
        try:
            await uazapi.disconnect_instance(instance_token=instance_token)
        except Exception as e:
            print(f"Aviso ao desconectar na Uazapi: {e}")
            
        # Delete from DB
        supabase.table("settings").delete().eq("tenant_id", user.id).eq("key", "uazapi_instance_token").execute()
        
    return {"message": "Instância desconectada e token removido."}
