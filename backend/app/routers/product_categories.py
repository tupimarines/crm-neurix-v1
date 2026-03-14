"""
Router for dynamic product categories.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from supabase import Client as SupabaseClient

from app.dependencies import get_current_user, get_supabase
from app.models.catalog import (
    ProductCategoryCreate,
    ProductCategoryResponse,
    ProductCategoryUpdate,
)

router = APIRouter()


@router.get("/", response_model=list[ProductCategoryResponse])
async def list_categories(
    search: str | None = Query(None, min_length=1),
    active_only: bool = Query(False),
    user=Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_supabase),
):
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


@router.post("/", response_model=ProductCategoryResponse, status_code=status.HTTP_201_CREATED)
async def create_category(
    payload: ProductCategoryCreate,
    user=Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_supabase),
):
    data = payload.model_dump()
    data["tenant_id"] = user.id
    created = supabase.table("product_categories").insert(data).execute()
    if not created.data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Erro ao criar categoria.")
    return ProductCategoryResponse(**created.data[0])


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
