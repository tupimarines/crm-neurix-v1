"""
Router for dynamic product categories.
"""

import json
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, status
from supabase import Client as SupabaseClient

from app.dependencies import get_current_user, get_supabase
from app.models.catalog import (
    ProductCategoryCreate,
    ProductCategoryResponse,
    ProductCategoryUpdate,
)

router = APIRouter()


# region agent log
def _debug_log(hypothesis_id: str, location: str, message: str, data: dict) -> None:
    try:
        payload = {
            "sessionId": "25dc31",
            "runId": "initial-debug",
            "hypothesisId": hypothesis_id,
            "location": location,
            "message": message,
            "data": data,
            "timestamp": int(datetime.now(timezone.utc).timestamp() * 1000),
        }
        with Path("debug-25dc31.log").open("a", encoding="utf-8") as fp:
            fp.write(json.dumps(payload, ensure_ascii=False) + "\n")
    except Exception:
        pass


# endregion


@router.get("/", response_model=list[ProductCategoryResponse])
async def list_categories(
    search: str | None = Query(None, min_length=1),
    active_only: bool = Query(False),
    user=Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_supabase),
):
    # region agent log
    _debug_log(
        "H3",
        "backend/app/routers/product_categories.py:list_categories",
        "Entering list_categories",
        {
            "user_id": str(user.id),
            "active_only": active_only,
            "has_search": bool(search),
        },
    )
    # endregion
    try:
        query = (
            supabase.table("product_categories")
            .select("*")
            .eq("tenant_id", user.id)
            .order("name", desc=False)
        )
        if active_only:
            query = query.eq("is_active", True)
        if search:
            query = query.ilike("name", f"%{search.strip()}%")
        response = query.execute()
        return [ProductCategoryResponse(**row) for row in (response.data or [])]
    except Exception as exc:
        # region agent log
        _debug_log(
            "H1",
            "backend/app/routers/product_categories.py:list_categories",
            "list_categories failed",
            {
                "error_type": type(exc).__name__,
                "error": str(exc),
            },
        )
        # endregion
        raise


@router.post("/", response_model=ProductCategoryResponse, status_code=status.HTTP_201_CREATED)
async def create_category(
    payload: ProductCategoryCreate,
    user=Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_supabase),
):
    # region agent log
    _debug_log(
        "H4",
        "backend/app/routers/product_categories.py:create_category",
        "Attempting category insert",
        {
            "user_id": str(user.id),
            "slug": payload.slug,
            "has_description": bool(payload.description),
            "is_active": payload.is_active,
        },
    )
    # endregion
    try:
        data = payload.model_dump()
        data["tenant_id"] = user.id
        created = supabase.table("product_categories").insert(data).execute()
        if not created.data:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Erro ao criar categoria.")
        return ProductCategoryResponse(**created.data[0])
    except Exception as exc:
        # region agent log
        _debug_log(
            "H1",
            "backend/app/routers/product_categories.py:create_category",
            "create_category failed",
            {
                "error_type": type(exc).__name__,
                "error": str(exc),
            },
        )
        # endregion
        raise


@router.patch("/{category_id}", response_model=ProductCategoryResponse)
async def update_category(
    category_id: str,
    payload: ProductCategoryUpdate,
    user=Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_supabase),
):
    update_data = payload.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nenhum campo para atualizar.")

    response = (
        supabase.table("product_categories")
        .update(update_data)
        .eq("id", category_id)
        .eq("tenant_id", user.id)
        .execute()
    )
    if not response.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Categoria não encontrada.")
    return ProductCategoryResponse(**response.data[0])


@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_category(
    category_id: str,
    user=Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_supabase),
):
    # Soft-delete to preserve history in orders
    response = (
        supabase.table("product_categories")
        .update({"is_active": False})
        .eq("id", category_id)
        .eq("tenant_id", user.id)
        .execute()
    )
    if not response.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Categoria não encontrada.")
