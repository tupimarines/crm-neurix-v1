"""
Products Router — CRUD for product catalog.
Maps to the Gestão de Produtos page.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from supabase import Client as SupabaseClient
from typing import Optional

from app.dependencies import get_supabase, get_current_user
from app.models.product import ProductCreate, ProductUpdate, ProductResponse

router = APIRouter()


@router.get("/", response_model=list[ProductResponse])
async def list_products(
    category_id: Optional[str] = None,
    category_slug: Optional[str] = None,
    search: Optional[str] = Query(None, min_length=1),
    active_only: bool = Query(False),
    user=Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_supabase),
):
    """List products with optional filters."""
    query = supabase.table("products").select("*") \
        .eq("tenant_id", user.id) \
        .order("created_at", desc=True)

    if category_id:
        query = query.eq("category_id", category_id)
    elif category_slug:
        category_response = (
            supabase.table("product_categories")
            .select("id")
            .eq("tenant_id", user.id)
            .eq("slug", category_slug)
            .single()
            .execute()
        )
        if not category_response.data:
            return []
        query = query.eq("category_id", category_response.data["id"])
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
    category_id = data.get("category_id")
    category_slug = data.get("category_slug")

    if category_slug and not category_id:
        category_by_slug = (
            supabase.table("product_categories")
            .select("id")
            .eq("tenant_id", user.id)
            .eq("slug", category_slug)
            .single()
            .execute()
        )
        if not category_by_slug.data:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Categoria (slug) não encontrada.")
        category_id = category_by_slug.data["id"]

    if category_id:
        category_by_id = (
            supabase.table("product_categories")
            .select("id, slug")
            .eq("tenant_id", user.id)
            .eq("id", category_id)
            .single()
            .execute()
        )
        if not category_by_id.data:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Categoria não encontrada.")
        data["category_id"] = category_by_id.data["id"]
        data["category_slug"] = category_by_id.data["slug"]
    else:
        data["category_id"] = None
        data["category_slug"] = None
        data["category"] = None

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

    category_id = update_data.get("category_id")
    category_slug = update_data.get("category_slug")
    if category_slug and not category_id:
        category_by_slug = (
            supabase.table("product_categories")
            .select("id")
            .eq("tenant_id", user.id)
            .eq("slug", category_slug)
            .single()
            .execute()
        )
        if not category_by_slug.data:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Categoria (slug) não encontrada.")
        update_data["category_id"] = category_by_slug.data["id"]

    if category_id or "category_id" in update_data:
        if update_data.get("category_id"):
            category_by_id = (
                supabase.table("product_categories")
                .select("id, slug")
                .eq("tenant_id", user.id)
                .eq("id", update_data["category_id"])
                .single()
                .execute()
            )
            if not category_by_id.data:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Categoria não encontrada.")
            update_data["category_slug"] = category_by_id.data["slug"]
        else:
            update_data["category_slug"] = None
            update_data["category"] = None

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
