"""
Products Router — CRUD for product catalog.
Maps to the Gestão de Produtos page.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from supabase import Client as SupabaseClient
from typing import Optional

from app.dependencies import get_supabase, get_current_user
from app.authz import EffectiveRole, require_org_admin
from app.models.product import ProductCreate, ProductUpdate, ProductResponse

router = APIRouter()
LEGACY_CATEGORIES = {"tradicional", "diet_zero", "gourmet", "sazonal"}


def _db_error_detail(exc: Exception) -> str:
    text = str(exc)
    details = getattr(exc, "details", None)
    if isinstance(details, str) and details.strip():
        return details
    return text or "Erro inesperado no banco."


def _is_missing_column_error(detail: str, column_name: str) -> bool:
    lowered = detail.lower()
    return "column" in lowered and column_name.lower() in lowered and "does not exist" in lowered


def _is_missing_table_error(detail: str, table_name: str) -> bool:
    lowered = detail.lower()
    return "relation" in lowered and table_name.lower() in lowered and "does not exist" in lowered


def _legacy_category_or_none(slug_or_category: str | None) -> str | None:
    if not slug_or_category:
        return None
    normalized = str(slug_or_category).strip().lower()
    return normalized if normalized in LEGACY_CATEGORIES else None


def _normalize_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = str(value).strip()
    return normalized if normalized else None


def _hydrate_legacy_category_from_category_id(
    supabase: SupabaseClient,
    tenant_id: str,
    rows: list[dict] | None,
) -> list[dict]:
    rows = rows or []
    category_ids = sorted({str(row.get("category_id")) for row in rows if row.get("category_id")})
    if not category_ids:
        return rows
    try:
        categories = (
            supabase.table("product_categories")
            .select("id, slug")
            .eq("tenant_id", tenant_id)
            .in_("id", category_ids)
            .execute()
        ).data or []
    except Exception as exc:
        detail = _db_error_detail(exc)
        if _is_missing_table_error(detail, "product_categories"):
            return rows
        raise

    slug_by_id = {str(row["id"]): str(row.get("slug") or "").strip().lower() for row in categories}
    for row in rows:
        raw_category = _normalize_optional_text(row.get("category"))
        legacy_category = _legacy_category_or_none(raw_category)
        if legacy_category:
            row["category"] = legacy_category
            continue
        category_id = str(row.get("category_id")) if row.get("category_id") else None
        if category_id and slug_by_id.get(category_id):
            row["category"] = slug_by_id[category_id]
        else:
            row["category"] = None
    return rows


def _insert_product_with_fallback(supabase: SupabaseClient, data: dict):
    try:
        return supabase.table("products").insert(data).execute()
    except Exception as exc:
        detail = _db_error_detail(exc)
        if _is_missing_column_error(detail, "category_id"):
            fallback = dict(data)
            fallback.pop("category_id", None)
            return supabase.table("products").insert(fallback).execute()
        raise


def _update_product_with_fallback(supabase: SupabaseClient, product_id: str, tenant_id: str, update_data: dict):
    try:
        return (
            supabase.table("products")
            .update(update_data)
            .eq("id", product_id)
            .eq("tenant_id", tenant_id)
            .execute()
        )
    except Exception as exc:
        detail = _db_error_detail(exc)
        if _is_missing_column_error(detail, "category_id"):
            fallback = dict(update_data)
            fallback.pop("category_id", None)
            return (
                supabase.table("products")
                .update(fallback)
                .eq("id", product_id)
                .eq("tenant_id", tenant_id)
                .execute()
            )
        raise


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
        try:
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
        except Exception as exc:
            detail = _db_error_detail(exc)
            # Compat mode for environments without the catalog migration.
            if _is_missing_table_error(detail, "product_categories"):
                query = query.eq("category", category_slug)
            else:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Erro ao filtrar por categoria: {detail}")
    if active_only:
        query = query.eq("is_active", True)
    if search:
        query = query.ilike("name", f"%{search}%")

    response = query.execute()
    rows = _hydrate_legacy_category_from_category_id(supabase, str(user.id), response.data or [])
    return [ProductResponse(**row) for row in rows]


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

    rows = _hydrate_legacy_category_from_category_id(supabase, str(user.id), [response.data])
    return ProductResponse(**rows[0])


@router.post("/", response_model=ProductResponse, status_code=status.HTTP_201_CREATED)
async def create_product(
    payload: ProductCreate,
    user=Depends(get_current_user),
    _eff: EffectiveRole = Depends(require_org_admin),
    supabase: SupabaseClient = Depends(get_supabase),
):
    """Create a new product."""
    data = payload.model_dump()
    data["tenant_id"] = user.id
    data["status"] = "em_estoque"
    data.pop("category_slug", None)  # products table does not store this field directly
    category_id = data.get("category_id")
    raw_category = _normalize_optional_text(data.get("category"))
    category_slug = _normalize_optional_text(payload.category_slug) or raw_category

    # Always sanitize legacy column to satisfy old check constraints.
    data["category"] = _legacy_category_or_none(raw_category)

    if category_slug:
        # Keep legacy enum column safe for old schemas with check constraint.
        data["category"] = _legacy_category_or_none(category_slug)

    if category_slug and not category_id:
        try:
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
        except HTTPException:
            raise
        except Exception as exc:
            detail = _db_error_detail(exc)
            if not _is_missing_table_error(detail, "product_categories"):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Erro ao validar categoria: {detail}")

    if category_id:
        try:
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
            data["category"] = _legacy_category_or_none(category_by_id.data["slug"])
        except HTTPException:
            raise
        except Exception as exc:
            detail = _db_error_detail(exc)
            if _is_missing_table_error(detail, "product_categories"):
                data.pop("category_id", None)
            else:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Erro ao validar categoria: {detail}")
    else:
        data.pop("category_id", None)
        if not category_slug:
            data["category"] = None

    try:
        response = _insert_product_with_fallback(supabase, data)
    except Exception as exc:
        detail = _db_error_detail(exc)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Erro ao criar produto: {detail}")

    if not response.data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Erro ao criar produto.")

    return ProductResponse(**response.data[0])


@router.patch("/{product_id}", response_model=ProductResponse)
async def update_product(
    product_id: str,
    payload: ProductUpdate,
    user=Depends(get_current_user),
    _eff: EffectiveRole = Depends(require_org_admin),
    supabase: SupabaseClient = Depends(get_supabase),
):
    """Update a product."""
    update_data = payload.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nenhum campo para atualizar.")

    update_data.pop("category_slug", None)  # products table does not store this field directly
    category_id = update_data.get("category_id")
    raw_category = _normalize_optional_text(update_data.get("category")) if "category" in update_data else None
    category_slug = _normalize_optional_text(payload.category_slug) if "category_slug" in payload.model_fields_set else raw_category
    if "category" in update_data:
        update_data["category"] = _legacy_category_or_none(raw_category)
    if category_slug:
        update_data["category"] = _legacy_category_or_none(category_slug)
    if category_slug and not category_id:
        try:
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
        except HTTPException:
            raise
        except Exception as exc:
            detail = _db_error_detail(exc)
            if _is_missing_table_error(detail, "product_categories"):
                update_data.pop("category_id", None)
            else:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Erro ao validar categoria: {detail}")

    if "category" in update_data and raw_category is None and "category_id" not in update_data:
        # Explicit "Sem categoria" from UI must clear dynamic category relation too.
        update_data["category_id"] = None

    if category_id or "category_id" in update_data:
        if update_data.get("category_id"):
            try:
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
                update_data["category"] = _legacy_category_or_none(category_by_id.data["slug"])
            except HTTPException:
                raise
            except Exception as exc:
                detail = _db_error_detail(exc)
                if _is_missing_table_error(detail, "product_categories"):
                    update_data.pop("category_id", None)
                else:
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Erro ao validar categoria: {detail}")
        else:
            update_data["category"] = None

    try:
        response = _update_product_with_fallback(supabase, product_id, user.id, update_data)
    except Exception as exc:
        detail = _db_error_detail(exc)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Erro ao atualizar produto: {detail}")

    if not response.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Produto não encontrado.")

    return ProductResponse(**response.data[0])


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_product(
    product_id: str,
    user=Depends(get_current_user),
    _eff: EffectiveRole = Depends(require_org_admin),
    supabase: SupabaseClient = Depends(get_supabase),
):
    """Delete a product."""
    supabase.table("products").delete() \
        .eq("id", product_id) \
        .eq("tenant_id", user.id) \
        .execute()
