"""
Products Router — CRUD for product catalog.
Maps to the Gestão de Produtos page.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from supabase import Client as SupabaseClient
from typing import Optional

from app.dependencies import get_supabase, get_current_user
from app.models.product import ProductCreate, ProductUpdate, ProductResponse, ProductCategory

router = APIRouter()


@router.get("/", response_model=list[ProductResponse])
async def list_products(
    category: Optional[ProductCategory] = None,
    search: Optional[str] = Query(None, min_length=1),
    active_only: bool = Query(False),
    user=Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_supabase),
):
    """List products with optional filters."""
    query = supabase.table("products").select("*") \
        .eq("tenant_id", user.id) \
        .order("created_at", desc=True)

    if category:
        query = query.eq("category", category.value)
    if active_only:
        query = query.eq("is_active", True)
    if search:
        query = query.ilike("name", f"%{search}%")

    response = query.execute()
    return [ProductResponse(**row) for row in response.data]


@router.get("/{product_id}", response_model=ProductResponse)
async def get_product(
    product_id: str,
    user=Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_supabase),
):
    """Get a single product by ID."""
    response = supabase.table("products").select("*") \
        .eq("id", product_id) \
        .eq("tenant_id", user.id) \
        .single().execute()

    if not response.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Produto não encontrado.")

    return ProductResponse(**response.data)


@router.post("/", response_model=ProductResponse, status_code=status.HTTP_201_CREATED)
async def create_product(
    payload: ProductCreate,
    user=Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_supabase),
):
    """Create a new product."""
    data = payload.model_dump()
    data["tenant_id"] = user.id
    data["status"] = "em_estoque"

    response = supabase.table("products").insert(data).execute()

    if not response.data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Erro ao criar produto.")

    return ProductResponse(**response.data[0])


@router.patch("/{product_id}", response_model=ProductResponse)
async def update_product(
    product_id: str,
    payload: ProductUpdate,
    user=Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_supabase),
):
    """Update a product."""
    update_data = payload.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nenhum campo para atualizar.")

    response = supabase.table("products") \
        .update(update_data) \
        .eq("id", product_id) \
        .eq("tenant_id", user.id) \
        .execute()

    if not response.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Produto não encontrado.")

    return ProductResponse(**response.data[0])


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_product(
    product_id: str,
    user=Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_supabase),
):
    """Delete a product."""
    supabase.table("products").delete() \
        .eq("id", product_id) \
        .eq("tenant_id", user.id) \
        .execute()
