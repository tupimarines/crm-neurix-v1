"""
Unified catalog search endpoint:
GET /api/catalog/search?q=<term>&types=product,promotion,category&limit=20&offset=0
"""

from time import perf_counter

from fastapi import APIRouter, Depends, HTTPException, Query
from supabase import Client as SupabaseClient

from app.dependencies import get_current_user, get_supabase
from app.models.catalog import CatalogSearchItem, CatalogSearchResponse
from app.observability import get_logger, metrics

router = APIRouter()
logger = get_logger("catalog_search")


@router.get("/search", response_model=CatalogSearchResponse)
async def search_catalog(
    q: str = Query(..., min_length=1),
    types: str = Query("product,promotion,category"),
    limit: int = Query(20, ge=1, le=20),
    offset: int = Query(0, ge=0),
    user=Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_supabase),
):
    started = perf_counter()
    parsed_types = {t.strip().lower() for t in types.split(",") if t.strip()}
    allowed = {"product", "promotion", "category"}
    if not parsed_types or not parsed_types.issubset(allowed):
        raise HTTPException(status_code=400, detail="Parâmetro types inválido.")

    query_term = q.strip()
    items: list[CatalogSearchItem] = []
    try:
        if "product" in parsed_types:
            products = (
                supabase.table("products")
                .select("id, name, price, is_active, category_id")
                .eq("tenant_id", user.id)
                .ilike("name", f"%{query_term}%")
                .order("name")
                .limit(limit)
                .execute()
            ).data or []
            for row in products:
                items.append(
                    CatalogSearchItem(
                        id=row["id"],
                        type="product",
                        label=row["name"],
                        subtitle="Produto",
                        product_id=row["id"],
                        category_id=row.get("category_id"),
                        price=float(row.get("price") or 0),
                        is_active=bool(row.get("is_active", True)),
                    )
                )

        if "promotion" in parsed_types:
            promos = (
                supabase.table("promotions")
                .select("id, name, discount_type, discount_value, is_active, category_id")
                .eq("tenant_id", user.id)
                .ilike("name", f"%{query_term}%")
                .order("priority", desc=True)
                .order("name")
                .limit(limit)
                .execute()
            ).data or []
            for row in promos:
                items.append(
                    CatalogSearchItem(
                        id=row["id"],
                        type="promotion",
                        label=row["name"],
                        subtitle="Promoção",
                        promotion_id=row["id"],
                        category_id=row.get("category_id"),
                        discount_type=row.get("discount_type"),
                        discount_value=float(row.get("discount_value") or 0),
                        is_active=bool(row.get("is_active", True)),
                    )
                )

        if "category" in parsed_types:
            categories = (
                supabase.table("product_categories")
                .select("id, name, is_active")
                .eq("tenant_id", user.id)
                .ilike("name", f"%{query_term}%")
                .order("name")
                .limit(limit)
                .execute()
            ).data or []
            for row in categories:
                items.append(
                    CatalogSearchItem(
                        id=row["id"],
                        type="category",
                        label=row["name"],
                        subtitle="Categoria",
                        category_id=row["id"],
                        is_active=bool(row.get("is_active", True)),
                    )
                )

        # Relevancia simples: startswith primeiro, depois ordenacao alfa.
        needle = query_term.lower()
        items.sort(key=lambda item: (0 if item.label.lower().startswith(needle) else 1, item.label.lower()))
        paged = items[offset : offset + limit]
        elapsed_ms = (perf_counter() - started) * 1000.0
        metrics.observe("catalog_search", elapsed_ms, ok=True)
        logger.info(
            "catalog_search_success",
            extra={
                "tenant_id": str(user.id),
                "query": query_term,
                "types": ",".join(sorted(parsed_types)),
                "limit": limit,
                "offset": offset,
                "result_count": len(paged),
                "elapsed_ms": round(elapsed_ms, 2),
            },
        )
        return CatalogSearchResponse(items=paged, limit=limit, offset=offset, total=len(items))
    except HTTPException:
        raise
    except Exception as exc:
        elapsed_ms = (perf_counter() - started) * 1000.0
        metrics.observe("catalog_search", elapsed_ms, ok=False)
        logger.exception(
            "catalog_search_failed",
            extra={"tenant_id": str(user.id), "query": query_term, "elapsed_ms": round(elapsed_ms, 2)},
        )
        raise HTTPException(status_code=500, detail=f"Falha na busca de catálogo: {str(exc)}")
