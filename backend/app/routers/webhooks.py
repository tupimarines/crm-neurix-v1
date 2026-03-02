"""
Webhooks Router — Receives external webhooks (Uazapi, NF-e).
Validates webhook secret (URL query param or header) and enqueues events
in Redis for async processing by the webhook_processor worker.
"""

import json
import secrets
from fastapi import APIRouter, Depends, HTTPException, status, Request, Header, Query
from typing import Optional
import redis.asyncio as aioredis

from app.config import get_settings, Settings
from app.dependencies import get_redis

router = APIRouter()


async def _validate_webhook_secret(
    request: Request,
    x_webhook_secret: Optional[str] = Header(None),
    authorization: Optional[str] = Header(None),
    secret: Optional[str] = Query(None),  # URL query param: ?secret=xxx
    settings: Settings = Depends(get_settings),
):
    """
    Validate the webhook request has a valid secret.
    Supports three methods:
      1. URL query parameter: ?secret=<value>  (recommended for Uazapi)
      2. Custom header: X-Webhook-Secret: <value>
      3. Authorization header: Bearer <value>
    """
    expected = settings.UAZAPI_WEBHOOK_SECRET
    if not expected:
        return  # No secret configured, skip validation

    # Check all three methods
    token = (
        secret  # URL query param (preferred for Uazapi since it has no custom headers)
        or x_webhook_secret  # Custom header
        or (authorization.replace("Bearer ", "") if authorization else None)
    )

    if token != expected:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Webhook secret inválido.",
        )


@router.post("/uazapi")
async def receive_uazapi_webhook(
    request: Request,
    redis: aioredis.Redis = Depends(get_redis),
    _=Depends(_validate_webhook_secret),
):
    """
    Receive webhook events from Uazapi (WhatsApp).
    Events are immediately enqueued in Redis for async processing.
    """
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Payload JSON inválido.")

    # Enqueue the event in Redis for the worker to process
    event = {
        "source": "uazapi",
        "payload": body,
    }

    await redis.rpush("neurix:webhook_queue", json.dumps(event))

    return {"status": "queued", "message": "Webhook recebido e enfileirado para processamento."}


@router.post("/invoice")
async def receive_invoice_webhook(
    request: Request,
    redis: aioredis.Redis = Depends(get_redis),
    _=Depends(_validate_webhook_secret),
):
    """
    Receive webhook events from NF-e API (future integration).
    Events are immediately enqueued in Redis for async processing.
    """
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Payload JSON inválido.")

    event = {
        "source": "invoice",
        "payload": body,
    }

    await redis.rpush("neurix:webhook_queue", json.dumps(event))

    return {"status": "queued", "message": "Webhook de NF-e recebido e enfileirado."}


@router.get("/generate-secret")
async def generate_webhook_secret():
    """
    Utility endpoint: generates a random webhook secret.
    Use this to create a UAZAPI_WEBHOOK_SECRET value.
    """
    new_secret = secrets.token_urlsafe(32)
    return {
        "secret": new_secret,
        "info": "Salve este secret no .env como UAZAPI_WEBHOOK_SECRET e use na URL do webhook Uazapi.",
        "example_webhook_url": f"https://crm.wbtech.dev/api/webhooks/uazapi?secret={new_secret}",
    }
