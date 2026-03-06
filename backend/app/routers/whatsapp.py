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
        return {"status": status_data.get("instance", {}).get("state", "unknown"), "data": status_data}
    except Exception as e:
        return {"status": "error", "message": f"Erro ao consultar Uazapi: {str(e)}"}


@router.post("/connect")
async def connect_instance(
    payload: ConnectRequest,
    user=Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_supabase),
):
    """Initiate a connection (Generate QR). If instance doesn't exist, it will be initialized."""
    instance_name = payload.instance_name
    
    # 1. Init instance (returns hash/token we need to use). 
    # Try to init, if it already exists, uazapi might just return it.
    try:
        init_res = await uazapi.init_instance(name=instance_name)
        # Uazapi returns the token (hash) inside the response, typically init_res["token"] or init_res["instance"]["token"]
        # Evolution API v1/v2 usually returns the token in the API response. We need to save this token.
        # Often the token is the 'hash' or just the instance name if configured that way, let's assume it returns it in 'token' or we use 'instance_name' if none
        instance_token = init_res.get("token", instance_name)
        if "instance" in init_res and "token" in init_res["instance"]:
            instance_token = init_res["instance"]["token"]
            
        # Save token to db
        supabase.table("settings").upsert({
            "tenant_id": user.id,
            "key": "uazapi_instance_token",
            "value": instance_token
        }, on_conflict="tenant_id,key").execute()
        
    except Exception as e:
        # If init fails (e.g., already exists), we could try to fetch from somewhere, but let's just proceed
        # For simplicity, if init fails, we assume we might already have the token in DB or it's the exact name
        pass
        
    # Read token newly saved or existing
    token_res = supabase.table("settings").select("value").eq("tenant_id", user.id).eq("key", "uazapi_instance_token").execute()
    if not token_res.data:
        raise HTTPException(status_code=400, detail="Não foi possível obter ou criar um token de instância.")
        
    instance_token = token_res.data[0]["value"]
    
    # 2. Call connect
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
