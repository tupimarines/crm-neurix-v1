"""
Router for promotions and promotion-product links.
"""

import json
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, status
from supabase import Client as SupabaseClient

from app.dependencies import get_current_user, get_supabase
from app.authz import EffectiveRole, require_org_admin
from app.models.catalog import (
    PromotionCreate,
    PromotionProductsPayload,
    PromotionResponse,
    PromotionUpdate,
)

router = APIRouter()


def _db_error_detail(exc: Exception) -> str:
    text = str(exc)
    details = getattr(exc, "details", None)
    if isinstance(details, str) and details.strip():
        return details
    return text or "Erro inesperado no banco."


def _is_missing_table_error(detail: str, table_name: str) -> bool:
    lowered = detail.lower()
    return "relation" in lowered and table_name.lower() in lowered and "does not exist" in lowered


def _is_schema_cache_column_error(detail: str, table_name: str, column_name: str) -> bool:
    lowered = detail.lower()
    return (
        "schema cache" in lowered
        and table_name.lower() in lowered
        and column_name.lower() in lowered
    )


def _is_schema_cache_table_error(detail: str, table_name: str) -> bool:
    lowered = detail.lower()
    return "schema cache" in lowered and table_name.lower() in lowered


def _is_not_null_column_error(detail: str, column_name: str) -> bool:
    lowered = detail.lower()
    return "null value in column" in lowered and column_name.lower() in lowered and "not-null constraint" in lowered


def _raise_catalog_error(exc: Exception, operation: str) -> None:
    if isinstance(exc, HTTPException):
        raise exc
    detail = _db_error_detail(exc)
    if (
        _is_missing_table_error(detail, "promotions")
        or _is_missing_table_error(detail, "promotion_products")
        or _is_schema_cache_table_error(detail, "promotions")
        or _is_schema_cache_column_error(detail, "promotions", "slug")
    ):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Catálogo comercial indisponível: schema incompleto/desatualizado no Supabase (rode a migration e recarregue o schema cache).",
        )
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{operation}: {detail}")


def _insert_promotion_with_fallback(supabase: SupabaseClient, data: dict):
    try:
        return supabase.table("promotions").insert(data).execute()
    except Exception as exc:
        detail = _db_error_detail(exc)
        # Legacy schema compatibility: some environments still require `value`.
        if _is_not_null_column_error(detail, "value"):
            fallback = dict(data)
            fallback["value"] = float(data.get("discount_value") or 0)
            return supabase.table("promotions").insert(fallback).execute()
        raise


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
    try:
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
    except Exception as exc:
        # region agent log
        _debug_log(
            "H1",
            "backend/app/routers/promotions.py:list_promotions",
            "list_promotions failed",
            {
                "error_type": type(exc).__name__,
                "error": str(exc),
            },
        )
        # endregion
        _raise_catalog_error(exc, "Erro ao listar promoções")


@router.post("/", response_model=PromotionResponse, status_code=status.HTTP_201_CREATED)
async def create_promotion(
    payload: PromotionCreate,
    user=Depends(get_current_user),
    _eff: EffectiveRole = Depends(require_org_admin),
    supabase: SupabaseClient = Depends(get_supabase),
):
    _validate_period(payload.starts_at, payload.ends_at)
    # region agent log
    _debug_log(
        "H4",
        "backend/app/routers/promotions.py:create_promotion",
        "Attempting promotion insert",
        {
            "user_id": str(user.id),
            "slug": payload.slug,
            "discount_type": payload.discount_type,
            "discount_value": payload.discount_value,
            "has_ends_at": payload.ends_at is not None,
            "product_ids_count": len(payload.product_ids),
        },
    )
    # endregion
    try:
        data = payload.model_dump(mode="json", exclude={"product_ids"})
        data["tenant_id"] = user.id
        created = _insert_promotion_with_fallback(supabase, data)
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
    except Exception as exc:
        # region agent log
        _debug_log(
            "H1",
            "backend/app/routers/promotions.py:create_promotion",
            "create_promotion failed",
            {
                "error_type": type(exc).__name__,
                "error": str(exc),
            },
        )
        # endregion
        _raise_catalog_error(exc, "Erro ao criar promoção")


@router.patch("/{promotion_id}", response_model=PromotionResponse)
async def update_promotion(
    promotion_id: str,
    payload: PromotionUpdate,
    user=Depends(get_current_user),
    _eff: EffectiveRole = Depends(require_org_admin),
    supabase: SupabaseClient = Depends(get_supabase),
):
    update_data = payload.model_dump(mode="json", exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nenhum campo para atualizar.")

    starts_at = update_data.get("starts_at")
    ends_at = update_data.get("ends_at")
    try:
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
    except Exception as exc:
        _raise_catalog_error(exc, "Erro ao atualizar promoção")
    if not response.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Promoção não encontrada.")
    row = response.data[0]
    try:
        link_rows = (
            supabase.table("promotion_products")
            .select("product_id")
            .eq("tenant_id", user.id)
            .eq("promotion_id", promotion_id)
            .execute()
        ).data or []
    except Exception as exc:
        _raise_catalog_error(exc, "Erro ao buscar vínculos da promoção")
    return _serialize_response(row, [r["product_id"] for r in link_rows])


@router.delete("/{promotion_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_promotion(
    promotion_id: str,
    user=Depends(get_current_user),
    _eff: EffectiveRole = Depends(require_org_admin),
    supabase: SupabaseClient = Depends(get_supabase),
):
    try:
        response = (
            supabase.table("promotions")
            .update({"is_active": False})
            .eq("id", promotion_id)
            .eq("tenant_id", user.id)
            .execute()
        )
    except Exception as exc:
        _raise_catalog_error(exc, "Erro ao inativar promoção")
    if not response.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Promoção não encontrada.")


@router.put("/{promotion_id}/products", response_model=PromotionResponse)
async def set_promotion_products(
    promotion_id: str,
    payload: PromotionProductsPayload,
    user=Depends(get_current_user),
    _eff: EffectiveRole = Depends(require_org_admin),
    supabase: SupabaseClient = Depends(get_supabase),
):
    try:
        promotion = (
            supabase.table("promotions")
            .select("*")
            .eq("id", promotion_id)
            .eq("tenant_id", user.id)
            .single()
            .execute()
        )
    except Exception as exc:
        _raise_catalog_error(exc, "Erro ao buscar promoção")
    if not promotion.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Promoção não encontrada.")

    try:
        supabase.table("promotion_products").delete().eq("promotion_id", promotion_id).eq("tenant_id", user.id).execute()
    except Exception as exc:
        _raise_catalog_error(exc, "Erro ao limpar produtos da promoção")

    normalized = [str(pid) for pid in payload.product_ids]
    if normalized:
        link_payload = [
            {"tenant_id": user.id, "promotion_id": promotion_id, "product_id": product_id}
            for product_id in normalized
        ]
        try:
            supabase.table("promotion_products").insert(link_payload).execute()
        except Exception as exc:
            _raise_catalog_error(exc, "Erro ao vincular produtos na promoção")

    return _serialize_response(promotion.data, normalized)


@router.get("/eligible/{product_id}")
async def list_eligible_promotions_for_product(
    product_id: str,
    user=Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_supabase),
):
    # Endpoint auxiliar para UI validar promoções ativas.
    now_utc = datetime.now(timezone.utc).isoformat()
    try:
        product = (
            supabase.table("products")
            .select("id, category_id")
            .eq("id", product_id)
            .eq("tenant_id", user.id)
            .single()
            .execute()
        )
    except Exception as exc:
        _raise_catalog_error(exc, "Erro ao buscar produto")
    if not product.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Produto não encontrado.")

    try:
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
    except Exception as exc:
        _raise_catalog_error(exc, "Erro ao listar promoções elegíveis")
    if not base_promotions:
        return {"items": []}

    try:
        link_rows = (
            supabase.table("promotion_products")
            .select("promotion_id")
            .eq("tenant_id", user.id)
            .eq("product_id", product_id)
            .execute()
        ).data or []
    except Exception as exc:
        _raise_catalog_error(exc, "Erro ao listar vínculos de promoção")
    linked_ids = {row["promotion_id"] for row in link_rows}

    category_id = product.data.get("category_id")
    eligible = [
        p
        for p in base_promotions
        if p["id"] in linked_ids or (category_id and str(p.get("category_id")) == str(category_id))
    ]
    return {"items": eligible}
