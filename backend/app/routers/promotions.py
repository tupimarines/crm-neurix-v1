"""
Router for promotions and promotion-product links.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from supabase import Client as SupabaseClient

from app.dependencies import get_current_user, get_supabase
from app.models.catalog import (
    PromotionCreate,
    PromotionProductsPayload,
    PromotionResponse,
    PromotionUpdate,
)

router = APIRouter()


def _validate_period(starts_at: datetime, ends_at: datetime | None) -> None:
    starts_utc = starts_at.astimezone(timezone.utc) if starts_at.tzinfo else starts_at.replace(tzinfo=timezone.utc)
    if ends_at is None:
        return
    ends_utc = ends_at.astimezone(timezone.utc) if ends_at.tzinfo else ends_at.replace(tzinfo=timezone.utc)
    if ends_utc < starts_utc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Período inválido: ends_at < starts_at.")


def _serialize_response(row: dict, product_ids: list[str]) -> PromotionResponse:
    return PromotionResponse(
        id=row["id"],
        tenant_id=row["tenant_id"],
        name=row["name"],
        slug=row["slug"],
        description=row.get("description"),
        discount_type=row["discount_type"],
        discount_value=float(row["discount_value"]),
        category_id=row.get("category_id"),
        starts_at=row["starts_at"],
        ends_at=row.get("ends_at"),
        priority=int(row.get("priority") or 0),
        is_active=bool(row.get("is_active", True)),
        product_ids=product_ids,
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


@router.get("/", response_model=list[PromotionResponse])
async def list_promotions(
    search: str | None = Query(None, min_length=1),
    active_only: bool = Query(False),
    user=Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_supabase),
):
    query = supabase.table("promotions").select("*").eq("tenant_id", user.id).order("created_at", desc=True)
    if active_only:
        query = query.eq("is_active", True)
    if search:
        query = query.ilike("name", f"%{search.strip()}%")
    response = query.execute()
    rows = response.data or []
    if not rows:
        return []

    ids = [r["id"] for r in rows]
    link_rows = (
        supabase.table("promotion_products")
        .select("promotion_id, product_id")
        .eq("tenant_id", user.id)
        .in_("promotion_id", ids)
        .execute()
    ).data or []
    links: dict[str, list[str]] = {}
    for link in link_rows:
        links.setdefault(link["promotion_id"], []).append(link["product_id"])

    return [_serialize_response(r, links.get(r["id"], [])) for r in rows]


@router.post("/", response_model=PromotionResponse, status_code=status.HTTP_201_CREATED)
async def create_promotion(
    payload: PromotionCreate,
    user=Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_supabase),
):
    _validate_period(payload.starts_at, payload.ends_at)
    data = payload.model_dump(exclude={"product_ids"})
    data["tenant_id"] = user.id
    created = supabase.table("promotions").insert(data).execute()
    if not created.data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Erro ao criar promoção.")
    promotion = created.data[0]

    if payload.product_ids:
        link_payload = [
            {
                "tenant_id": user.id,
                "promotion_id": promotion["id"],
                "product_id": str(product_id),
            }
            for product_id in payload.product_ids
        ]
        supabase.table("promotion_products").insert(link_payload).execute()
    return _serialize_response(promotion, [str(pid) for pid in payload.product_ids])


@router.patch("/{promotion_id}", response_model=PromotionResponse)
async def update_promotion(
    promotion_id: str,
    payload: PromotionUpdate,
    user=Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_supabase),
):
    update_data = payload.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nenhum campo para atualizar.")

    starts_at = update_data.get("starts_at")
    ends_at = update_data.get("ends_at")
    if starts_at or ends_at:
        current = (
            supabase.table("promotions")
            .select("starts_at, ends_at")
            .eq("id", promotion_id)
            .eq("tenant_id", user.id)
            .single()
            .execute()
        )
        if not current.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Promoção não encontrada.")
        _validate_period(starts_at or current.data["starts_at"], ends_at if ends_at is not None else current.data["ends_at"])

    response = (
        supabase.table("promotions")
        .update(update_data)
        .eq("id", promotion_id)
        .eq("tenant_id", user.id)
        .execute()
    )
    if not response.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Promoção não encontrada.")
    row = response.data[0]
    link_rows = (
        supabase.table("promotion_products")
        .select("product_id")
        .eq("tenant_id", user.id)
        .eq("promotion_id", promotion_id)
        .execute()
    ).data or []
    return _serialize_response(row, [r["product_id"] for r in link_rows])


@router.delete("/{promotion_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_promotion(
    promotion_id: str,
    user=Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_supabase),
):
    response = (
        supabase.table("promotions")
        .update({"is_active": False})
        .eq("id", promotion_id)
        .eq("tenant_id", user.id)
        .execute()
    )
    if not response.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Promoção não encontrada.")


@router.put("/{promotion_id}/products", response_model=PromotionResponse)
async def set_promotion_products(
    promotion_id: str,
    payload: PromotionProductsPayload,
    user=Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_supabase),
):
    promotion = (
        supabase.table("promotions")
        .select("*")
        .eq("id", promotion_id)
        .eq("tenant_id", user.id)
        .single()
        .execute()
    )
    if not promotion.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Promoção não encontrada.")

    supabase.table("promotion_products").delete().eq("promotion_id", promotion_id).eq("tenant_id", user.id).execute()

    normalized = [str(pid) for pid in payload.product_ids]
    if normalized:
        link_payload = [
            {"tenant_id": user.id, "promotion_id": promotion_id, "product_id": product_id}
            for product_id in normalized
        ]
        supabase.table("promotion_products").insert(link_payload).execute()

    return _serialize_response(promotion.data, normalized)


@router.get("/eligible/{product_id}")
async def list_eligible_promotions_for_product(
    product_id: str,
    user=Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_supabase),
):
    # Endpoint auxiliar para UI validar promoções ativas.
    now_utc = datetime.now(timezone.utc).isoformat()
    product = (
        supabase.table("products")
        .select("id, category_id")
        .eq("id", product_id)
        .eq("tenant_id", user.id)
        .single()
        .execute()
    )
    if not product.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Produto não encontrado.")

    base_promotions = (
        supabase.table("promotions")
        .select("*")
        .eq("tenant_id", user.id)
        .eq("is_active", True)
        .lte("starts_at", now_utc)
        .or_(f"ends_at.is.null,ends_at.gte.{now_utc}")
        .order("priority", desc=True)
        .order("created_at", desc=True)
        .execute()
    ).data or []
    if not base_promotions:
        return {"items": []}

    link_rows = (
        supabase.table("promotion_products")
        .select("promotion_id")
        .eq("tenant_id", user.id)
        .eq("product_id", product_id)
        .execute()
    ).data or []
    linked_ids = {row["promotion_id"] for row in link_rows}

    category_id = product.data.get("category_id")
    eligible = [
        p
        for p in base_promotions
        if p["id"] in linked_ids or (category_id and str(p.get("category_id")) == str(category_id))
    ]
    return {"items": eligible}
