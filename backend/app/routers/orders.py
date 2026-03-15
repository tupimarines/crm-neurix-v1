"""
Orders Router — CRUD for orders.
Maps to the Dashboard orders table.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from supabase import Client as SupabaseClient
from typing import Optional
from datetime import datetime, timezone
from time import perf_counter

from app.dependencies import get_supabase, get_current_user
from app.models.order import OrderCreate, OrderUpdate, OrderResponse, PaymentStatus
from app.observability import get_logger, metrics
from app.services.promotion_engine import apply_promotion_discount, round_money, select_best_promotion

router = APIRouter()
logger = get_logger("orders")


def _to_positive_int(value, default: int = 0) -> int:
    try:
        parsed = int(value)
        return parsed if parsed > 0 else default
    except Exception:
        return default


def _aggregate_quantities(items: list[dict]) -> dict[str, int]:
    aggregated: dict[str, int] = {}
    for item in items or []:
        product_id = str(item.get("product_id") or item.get("id") or "").strip()
        if not product_id:
            continue
        quantity = _to_positive_int(item.get("quantity") or item.get("qty") or 0, default=0)
        if quantity <= 0:
            continue
        aggregated[product_id] = aggregated.get(product_id, 0) + quantity
    return aggregated


def _normalize_reserved_items(items: list[dict] | None) -> list[dict]:
    normalized: list[dict] = []
    for item in items or []:
        product_id = str(item.get("product_id") or item.get("id") or "").strip()
        if not product_id:
            continue
        quantity = _to_positive_int(item.get("quantity") or item.get("qty") or 0, default=0)
        if quantity <= 0:
            continue
        normalized.append({"product_id": product_id, "quantity": quantity})
    return normalized


def _subtract_products_json(items: list[dict] | None, consumed_by_product: dict[str, int]) -> list[dict]:
    remaining: list[dict] = []
    tracker = dict(consumed_by_product)
    for item in items or []:
        product_id = str(item.get("id") or item.get("product_id") or "").strip()
        if not product_id:
            continue
        current_qty = _to_positive_int(item.get("quantity") or item.get("qty") or 0, default=0)
        if current_qty <= 0:
            continue
        consume = min(current_qty, _to_positive_int(tracker.get(product_id), default=0))
        next_qty = current_qty - consume
        tracker[product_id] = _to_positive_int(tracker.get(product_id), default=0) - consume
        if next_qty <= 0:
            continue
        next_item = dict(item)
        if "quantity" in next_item:
            next_item["quantity"] = next_qty
        else:
            next_item["qty"] = next_qty
        remaining.append(next_item)
    return remaining


def _apply_stock_consumption(*, supabase: SupabaseClient, tenant_id: str, consumption_by_product: dict[str, int]) -> None:
    if not consumption_by_product:
        return
    product_ids = list(consumption_by_product.keys())
    products = (
        supabase.table("products")
        .select("id, name, stock_quantity")
        .eq("tenant_id", tenant_id)
        .in_("id", product_ids)
        .execute()
    ).data or []
    by_id = {str(row["id"]): row for row in products}
    missing = [pid for pid in product_ids if pid not in by_id]
    if missing:
        raise HTTPException(status_code=400, detail=f"Produtos não encontrados para estoque: {', '.join(missing)}")

    for product_id, qty in consumption_by_product.items():
        current_stock = int(by_id[product_id].get("stock_quantity") or 0)
        new_stock = current_stock - int(qty)
        if new_stock < 0:
            raise HTTPException(
                status_code=400,
                detail=f"Estoque insuficiente para '{by_id[product_id].get('name') or product_id}'. Disponível: {current_stock}, solicitado: {qty}.",
            )

    for product_id, qty in consumption_by_product.items():
        current_stock = int(by_id[product_id].get("stock_quantity") or 0)
        new_stock = current_stock - int(qty)
        supabase.table("products").update({"stock_quantity": new_stock}).eq("id", product_id).eq("tenant_id", tenant_id).execute()


@router.get("/", response_model=list[OrderResponse])
async def list_orders(
    payment_status: Optional[PaymentStatus] = None,
    limit: int = Query(20, ge=1, le=100),
    user=Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_supabase),
):
    """List orders with optional payment status filter."""
    query = supabase.table("orders").select("*").eq("tenant_id", user.id).order("created_at", desc=True).limit(limit)

    if payment_status:
        query = query.eq("payment_status", payment_status.value)

    response = query.execute()
    return [OrderResponse(**row) for row in response.data]


@router.post("/", response_model=OrderResponse, status_code=status.HTTP_201_CREATED)
async def create_order(
    payload: OrderCreate,
    user=Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_supabase),
):
    """Create order with deterministic promotion calculation."""
    started = perf_counter()
    now_utc = datetime.now(timezone.utc)
    data = payload.model_dump()
    data["tenant_id"] = user.id

    items = data.get("products_json") or []
    normalized_items: list[dict] = []
    for item in items:
        product_id = str(item.get("id") or item.get("product_id") or "").strip()
        if not product_id:
            continue
        qty = int(item.get("qty") or item.get("quantity") or 1)
        if qty < 1:
            continue
        normalized_items.append({"product_id": product_id, "quantity": qty})

    product_ids = list({item["product_id"] for item in normalized_items})
    products_map: dict[str, dict] = {}
    if product_ids:
        product_rows = (
            supabase.table("products")
            .select("id, name, price, category_id, is_active")
            .eq("tenant_id", user.id)
            .in_("id", product_ids)
            .execute()
        ).data or []
        products_map = {row["id"]: row for row in product_rows}

    missing_ids = [pid for pid in product_ids if pid not in products_map]
    if missing_ids:
        raise HTTPException(status_code=400, detail=f"Produtos não encontrados: {', '.join(missing_ids)}")

    category_ids = list(
        {
            str(products_map[item["product_id"]].get("category_id"))
            for item in normalized_items
            if products_map[item["product_id"]].get("category_id")
        }
    )

    promotions_rows = (
        supabase.table("promotions")
        .select("id, name, discount_type, discount_value, category_id, starts_at, ends_at, priority, is_active, created_at")
        .eq("tenant_id", user.id)
        .execute()
    ).data or []
    promotion_ids = [row["id"] for row in promotions_rows]
    link_rows = []
    if promotion_ids and product_ids:
        link_rows = (
            supabase.table("promotion_products")
            .select("promotion_id, product_id")
            .eq("tenant_id", user.id)
            .in_("promotion_id", promotion_ids)
            .in_("product_id", product_ids)
            .execute()
        ).data or []

    linked_by_product: dict[str, list[dict]] = {}
    linked_by_category: dict[str, list[dict]] = {}
    promo_by_id = {row["id"]: row for row in promotions_rows}
    for link in link_rows:
        promo = promo_by_id.get(link["promotion_id"])
        if not promo:
            continue
        enriched = {**promo, "link_type": "product", "product_id": link["product_id"]}
        linked_by_product.setdefault(link["product_id"], []).append(enriched)

    for promo in promotions_rows:
        category_id = promo.get("category_id")
        if category_id and str(category_id) in category_ids:
            linked_by_category.setdefault(str(category_id), []).append({**promo, "link_type": "category"})

    resolved_lines: list[dict] = []
    applied_promotions: list[dict] = []
    subtotal = 0.0
    discount_total = 0.0

    for item in normalized_items:
        product = products_map[item["product_id"]]
        if not product.get("is_active", True):
            raise HTTPException(status_code=400, detail=f"Produto inativo não pode ser usado em novo pedido: {product['name']}")
        unit_price = float(product.get("price") or 0.0)
        quantity = int(item["quantity"])
        line_subtotal = round_money(unit_price * quantity)
        subtotal += line_subtotal

        category_id = str(product.get("category_id")) if product.get("category_id") else None
        candidates = []
        candidates.extend(linked_by_product.get(product["id"], []))
        if category_id:
            candidates.extend(linked_by_category.get(category_id, []))

        selected = select_best_promotion(
            product_id=product["id"],
            category_id=category_id,
            candidate_promotions=candidates,
            now_utc=now_utc,
        )
        line_discount = apply_promotion_discount(line_subtotal, selected)
        if line_discount > 0 and selected:
            applied_promotions.append(
                {
                    "product_id": product["id"],
                    "product_name": product["name"],
                    "promotion_id": selected["id"],
                    "promotion_name": selected["name"],
                    "discount_type": selected["discount_type"],
                    "discount_value": float(selected.get("discount_value") or 0),
                    "line_subtotal": line_subtotal,
                    "line_discount": line_discount,
                }
            )

        discount_total += line_discount
        resolved_lines.append(
            {
                "id": product["id"],
                "name": product["name"],
                "price": unit_price,
                "qty": quantity,
                "category_id": category_id,
                "line_subtotal": line_subtotal,
                "line_discount": line_discount,
            }
        )

    subtotal = round_money(subtotal)
    discount_total = round_money(discount_total)
    total = round_money(max(subtotal - discount_total, 0))

    data["products_json"] = resolved_lines
    if not data.get("product_summary"):
        data["product_summary"] = ", ".join([f"{line['name']} (x{line['qty']})" for line in resolved_lines]) or "Sem itens"
    data["applied_promotions_json"] = applied_promotions
    data["subtotal"] = subtotal
    data["discount_total"] = discount_total
    data["total"] = total

    order_quantities = _aggregate_quantities(normalized_items)
    stock_consumption = dict(order_quantities)
    lead_row = None
    reserved_consumed: dict[str, int] = {}
    if data.get("lead_id"):
        lead_lookup = (
            supabase.table("leads")
            .select("id, products_json, stock_reserved_json, purchase_history_json")
            .eq("id", data["lead_id"])
            .eq("tenant_id", user.id)
            .single()
            .execute()
        )
        lead_row = lead_lookup.data
        if lead_row:
            reserved_by_product = _aggregate_quantities(
                lead_row.get("stock_reserved_json") or lead_row.get("products_json") or []
            )
            stock_consumption = {}
            for product_id, ordered_qty in order_quantities.items():
                reserved_qty = reserved_by_product.get(product_id, 0)
                covered_by_reservation = min(reserved_qty, ordered_qty)
                if covered_by_reservation > 0:
                    reserved_consumed[product_id] = covered_by_reservation
                remaining_to_consume = ordered_qty - covered_by_reservation
                if remaining_to_consume > 0:
                    stock_consumption[product_id] = remaining_to_consume

    if stock_consumption:
        _apply_stock_consumption(
            supabase=supabase,
            tenant_id=user.id,
            consumption_by_product=stock_consumption,
        )

    try:
        response = supabase.table("orders").insert(data).execute()
    except Exception:
        if stock_consumption:
            try:
                rollback_map = {pid: -qty for pid, qty in stock_consumption.items()}
                _apply_stock_consumption(
                    supabase=supabase,
                    tenant_id=user.id,
                    consumption_by_product=rollback_map,
                )
            except Exception:
                logger.exception("order_create_stock_rollback_failed", extra={"tenant_id": str(user.id)})
        raise
    if not response.data:
        if stock_consumption:
            try:
                rollback_map = {pid: -qty for pid, qty in stock_consumption.items()}
                _apply_stock_consumption(
                    supabase=supabase,
                    tenant_id=user.id,
                    consumption_by_product=rollback_map,
                )
            except Exception:
                logger.exception("order_create_stock_rollback_failed", extra={"tenant_id": str(user.id)})
        metrics.observe("orders_create", (perf_counter() - started) * 1000.0, ok=False)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Erro ao criar pedido.")

    if lead_row:
        try:
            reserved_before = _aggregate_quantities(
                lead_row.get("stock_reserved_json") or lead_row.get("products_json") or []
            )
            reserved_after_map: dict[str, int] = {}
            for product_id, reserved_qty in reserved_before.items():
                consumed_qty = reserved_consumed.get(product_id, 0)
                remaining_qty = reserved_qty - consumed_qty
                if remaining_qty > 0:
                    reserved_after_map[product_id] = remaining_qty

            reserved_after = [
                {"product_id": pid, "quantity": qty}
                for pid, qty in reserved_after_map.items()
            ]
            purchase_history = list(lead_row.get("purchase_history_json") or [])
            purchase_history.append(
                {
                    "order_id": response.data[0]["id"],
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "products": resolved_lines,
                    "total": total,
                    "subtotal": subtotal,
                    "discount_total": discount_total,
                    "payment_status": data.get("payment_status"),
                }
            )
            remaining_products_json = _subtract_products_json(
                lead_row.get("products_json") or [],
                order_quantities,
            )
            supabase.table("leads").update(
                {
                    "stock_reserved_json": reserved_after,
                    "products_json": remaining_products_json,
                    "purchase_history_json": purchase_history,
                }
            ).eq("id", lead_row["id"]).eq("tenant_id", user.id).execute()
        except Exception:
            logger.exception(
                "order_create_lead_history_update_failed",
                extra={"tenant_id": str(user.id), "lead_id": str(lead_row.get("id"))},
            )

    elapsed_ms = (perf_counter() - started) * 1000.0
    metrics.observe("orders_create", elapsed_ms, ok=True)
    logger.info(
        "order_created",
        extra={
            "tenant_id": str(user.id),
            "result_count": len(resolved_lines),
            "elapsed_ms": round(elapsed_ms, 2),
        },
    )
    return OrderResponse(**response.data[0])


@router.patch("/{order_id}", response_model=OrderResponse)
async def update_order(
    order_id: str,
    payload: OrderUpdate,
    user=Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_supabase),
):
    """Update an order (e.g., change payment status)."""
    update_data = payload.model_dump(exclude_unset=True)

    response = supabase.table("orders") \
        .update(update_data) \
        .eq("id", order_id) \
        .eq("tenant_id", user.id) \
        .execute()

    if not response.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pedido não encontrado.")

    return OrderResponse(**response.data[0])
