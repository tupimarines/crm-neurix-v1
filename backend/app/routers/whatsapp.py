"""
WhatsApp Integration Router
Handles Uazapi instance management — escopado por inbox (Sprint 7) ou legado via settings.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from supabase import Client as SupabaseClient

from app.dependencies import get_current_user, get_supabase
from app.services.uazapi_service import UazapiService

router = APIRouter()
uazapi = UazapiService()

UAZAPI_TOKEN_KEY = "instance_token"


class ConnectRequest(BaseModel):
    instance_name: str
    inbox_id: Optional[str] = Field(
        None,
        description="UUID da caixa de entrada — credenciais ficam em inboxes.uazapi_settings.",
    )


class TokenRequest(BaseModel):
    instance_token: str
    inbox_id: Optional[str] = Field(None, description="Se omitido, usa settings legado por tenant.")
    instance_name: Optional[str] = Field(
        None,
        description="Nome da instância na Uazapi (o webhook envia em instanceName) — usado para resolver a caixa se o token não vier no payload.",
    )


def _legacy_settings_token(supabase: SupabaseClient, user_id: str) -> Optional[str]:
    response = (
        supabase.table("settings")
        .select("value")
        .eq("tenant_id", user_id)
        .eq("key", "uazapi_instance_token")
        .execute()
    )
    if not response.data:
        return None
    return response.data[0]["value"]


def _load_inbox_row(supabase: SupabaseClient, inbox_id: str, user_id: str) -> dict[str, Any]:
    res = supabase.table("inboxes").select("*").eq("id", inbox_id).limit(1).execute()
    rows = res.data or []
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Caixa de entrada não encontrada.")
    row = rows[0]
    if str(row["tenant_id"]) != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Esta caixa não pertence ao seu tenant.")
    return row


def _token_from_inbox_row(row: dict[str, Any]) -> Optional[str]:
    settings = row.get("uazapi_settings") or {}
    if isinstance(settings, dict):
        t = settings.get(UAZAPI_TOKEN_KEY)
        return str(t) if t else None
    return None


def _resolve_instance_token(
    supabase: SupabaseClient,
    user_id: str,
    inbox_id: Optional[str],
) -> tuple[Optional[str], str]:
    """
    Retorna (token, modo): modo 'inbox' ou 'legacy'.
    """
    if inbox_id:
        row = _load_inbox_row(supabase, inbox_id, user_id)
        return _token_from_inbox_row(row), "inbox"
    return _legacy_settings_token(supabase, user_id), "legacy"


def _save_token_to_inbox(
    supabase: SupabaseClient,
    inbox_id: str,
    user_id: str,
    instance_token: str,
    *,
    instance_name: Optional[str] = None,
) -> None:
    row = _load_inbox_row(supabase, inbox_id, user_id)
    settings = dict(row.get("uazapi_settings") or {})
    if not isinstance(settings, dict):
        settings = {}
    settings[UAZAPI_TOKEN_KEY] = instance_token
    if instance_name and str(instance_name).strip():
        settings["instance_name"] = str(instance_name).strip()
    now = datetime.now(timezone.utc).isoformat()
    supabase.table("inboxes").update({"uazapi_settings": settings, "updated_at": now}).eq("id", inbox_id).eq(
        "tenant_id", user_id
    ).execute()


def _save_token_legacy(supabase: SupabaseClient, user_id: str, instance_token: str) -> None:
    supabase.table("settings").upsert(
        {"tenant_id": user_id, "key": "uazapi_instance_token", "value": instance_token},
        on_conflict="tenant_id,key",
    ).execute()


def _configure_webhook(instance_token: str) -> None:
    from app.config import get_settings

    settings = get_settings()
    webhook_url = settings.uazapi_webhook_callback_url
    try:
        uazapi.set_webhook(url=webhook_url, instance_token=instance_token)
    except Exception as e:
        print(f"Error setting webhook: {e}")


@router.get("/status")
async def get_status(
    inbox_id: Optional[str] = Query(None, description="Escopo da instância Uazapi (caixa de entrada)."),
    user=Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_supabase),
):
    """Status da conexão WhatsApp — por inbox ou legado (settings)."""
    uid = str(user.id)
    instance_token, mode = _resolve_instance_token(supabase, uid, inbox_id)

    if not instance_token:
        msg = "Nenhum token configurado para esta caixa." if mode == "inbox" else "Nenhum token configurado."
        return {"status": "disconnected", "message": msg, "scope": mode}

    try:
        status_data = await uazapi.get_instance_status(instance_token=instance_token)

        instance_state = "unknown"
        if "instance" in status_data:
            instance_state = status_data["instance"].get(
                "state", status_data["instance"].get("status", "unknown")
            )
        elif "state" in status_data:
            instance_state = status_data["state"]
        elif "status" in status_data:
            instance_state = status_data["status"]

        return {"status": instance_state, "data": status_data, "scope": mode}
    except Exception as e:
        return {"status": "error", "message": f"Erro ao consultar Uazapi: {str(e)}", "scope": mode}


@router.post("/init")
async def init_instance_route(
    payload: ConnectRequest,
    user=Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_supabase),
):
    """Inicializa instância Uazapi e grava token na caixa (inbox) ou em settings (legado)."""
    uid = str(user.id)
    instance_name = payload.instance_name
    instance_token = None

    try:
        instances = await uazapi.list_instances()
        for inst in instances:
            inst_name = inst.get("instance", {}).get("instanceName", inst.get("name", ""))
            if inst_name == instance_name:
                instance_token = inst.get("instance", {}).get("token", inst.get("token", ""))
                break
    except Exception as e:
        print(f"Error listing instances: {e}")

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

    if payload.inbox_id:
        _save_token_to_inbox(supabase, payload.inbox_id, uid, instance_token, instance_name=instance_name)
    else:
        _save_token_legacy(supabase, uid, instance_token)

    _configure_webhook(instance_token)

    return {"message": "Instância inicializada e webhook configurado", "token": instance_token}


@router.post("/connect")
async def connect_instance(
    inbox_id: Optional[str] = Query(None),
    user=Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_supabase),
):
    """QR / conexão — requer token já salvo na caixa ou settings legado."""
    uid = str(user.id)
    instance_token, mode = _resolve_instance_token(supabase, uid, inbox_id)

    if not instance_token:
        raise HTTPException(
            status_code=400,
            detail="Nenhum token configurado. Inicialize a instância ou informe inbox_id com token.",
        )

    try:
        connect_data = await uazapi.connect_instance(instance_token=instance_token)
        return {"message": "Connection initiated", "data": connect_data, "scope": mode}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao conectar: {str(e)}")


@router.post("/token")
async def save_manual_token(
    payload: TokenRequest,
    user=Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_supabase),
):
    """Salva token manual (Leads Infinitos / instância existente)."""
    uid = str(user.id)

    if payload.inbox_id:
        _save_token_to_inbox(
            supabase,
            payload.inbox_id,
            uid,
            payload.instance_token,
            instance_name=payload.instance_name,
        )
    else:
        _save_token_legacy(supabase, uid, payload.instance_token)

    _configure_webhook(payload.instance_token)

    return {"message": "Token salvo com sucesso", "status": "saved"}


@router.delete("/disconnect")
async def disconnect_instance(
    inbox_id: Optional[str] = Query(None),
    user=Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_supabase),
):
    """Remove token da caixa ou do settings legado e desconecta na Uazapi quando possível."""
    uid = str(user.id)

    if inbox_id:
        row = _load_inbox_row(supabase, inbox_id, uid)
        instance_token = _token_from_inbox_row(row)
        if instance_token:
            try:
                await uazapi.disconnect_instance(instance_token=instance_token)
            except Exception as e:
                print(f"Aviso ao desconectar na Uazapi: {e}")
        settings = dict(row.get("uazapi_settings") or {})
        if isinstance(settings, dict) and UAZAPI_TOKEN_KEY in settings:
            del settings[UAZAPI_TOKEN_KEY]
        if isinstance(settings, dict) and "instance_name" in settings:
            del settings["instance_name"]
        now = datetime.now(timezone.utc).isoformat()
        supabase.table("inboxes").update({"uazapi_settings": settings, "updated_at": now}).eq("id", inbox_id).eq(
            "tenant_id", uid
        ).execute()
        return {"message": "Instância desconectada e token removido da caixa."}

    response = (
        supabase.table("settings").select("value").eq("tenant_id", uid).eq("key", "uazapi_instance_token").execute()
    )
    if response.data:
        instance_token = response.data[0]["value"]
        try:
            await uazapi.disconnect_instance(instance_token=instance_token)
        except Exception as e:
            print(f"Aviso ao desconectar na Uazapi: {e}")

        supabase.table("settings").delete().eq("tenant_id", uid).eq("key", "uazapi_instance_token").execute()

    return {"message": "Instância desconectada e token removido."}
