"""
Upload Router — File upload to Supabase Storage.
"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from supabase import Client as SupabaseClient
import uuid
import mimetypes

from app.dependencies import get_supabase, get_current_user

router = APIRouter()

ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_SIZE_BYTES = 5 * 1024 * 1024  # 5MB


@router.post("/product-image", status_code=status.HTTP_201_CREATED)
async def upload_product_image(
    file: UploadFile = File(...),
    user=Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_supabase),
):
    """Upload a product image to Supabase Storage and return the public URL."""

    # Validate MIME type — accept any image/*
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Tipo de arquivo não suportado. Use uma imagem (JPEG, PNG ou WebP).",
        )

    content = await file.read()

    # Validate size
    if len(content) > MAX_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Arquivo muito grande. Limite: 5MB.",
        )

    # Generate unique filename
    mime = file.content_type or "image/jpeg"
    ext_map = {"image/jpeg": ".jpg", "image/jpg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
    ext = ext_map.get(mime, ".jpg")
    filename = f"{user.id}/{uuid.uuid4()}{ext}"

    try:
        response = supabase.storage.from_("products").upload(
            path=filename,
            file=content,
            file_options={"content-type": mime, "upsert": "true"},
        )

        # Get public URL
        public_url = supabase.storage.from_("products").get_public_url(filename)
        return {"url": public_url, "path": filename}

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao fazer upload: {str(e)}",
        )
