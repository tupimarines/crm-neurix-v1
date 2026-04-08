"""
Reserva e liberação de estoque alinhada a `products_json` / `stock_reserved_json` do lead.
Usado pelo PATCH de lead e por `_update_products_json` no webhook n8n (`cart_update` / `pedido`).
"""

from fastapi import HTTPException, status
from supabase import Client as SupabaseClient


def _to_positive_int(value, default: int = 0) -> int:
    try:
        parsed = int(value)
        return parsed if parsed > 0 else default
    except Exception:
        return default


def normalize_reserved_items(items: list[dict] | None) -> list[dict]:
    normalized: list[dict] = []
    for item in (items or []):
        product_id = str(item.get("product_id") or item.get("id") or "").strip()
        if not product_id:
            continue
        quantity = _to_positive_int(item.get("quantity") or item.get("qty") or 0, default=0)
        if quantity <= 0:
            continue
        normalized.append({"product_id": product_id, "quantity": quantity})
    return normalized


def aggregate_reserved(items: list[dict] | None) -> dict[str, int]:
    aggregated: dict[str, int] = {}
    for item in normalize_reserved_items(items):
        aggregated[item["product_id"]] = aggregated.get(item["product_id"], 0) + int(item["quantity"])
    return aggregated


def compute_stock_delta(
    previous_reserved: list[dict] | None, next_products: list[dict] | None
) -> tuple[list[dict], dict[str, int]]:
    previous = aggregate_reserved(previous_reserved)
    next_reserved = normalize_reserved_items(next_products)
    nxt = aggregate_reserved(next_reserved)
    product_ids = set(previous.keys()) | set(nxt.keys())
    delta: dict[str, int] = {}
    for product_id in product_ids:
        # Positive delta => reserve more (decrease stock)
        # Negative delta => release reservation (increase stock)
        diff = nxt.get(product_id, 0) - previous.get(product_id, 0)
        if diff != 0:
            delta[product_id] = diff
    return next_reserved, delta


def invert_delta(delta: dict[str, int]) -> dict[str, int]:
    return {product_id: -qty for product_id, qty in delta.items()}


def apply_stock_delta(
    *,
    supabase: SupabaseClient,
    tenant_id: str,
    delta: dict[str, int],
) -> None:
    if not delta:
        return
    product_ids = list(delta.keys())
    products = (
        supabase.table("products")
        .select("id, name, stock_quantity, is_active")
        .eq("tenant_id", tenant_id)
        .in_("id", product_ids)
        .execute()
    ).data or []
    by_id = {str(row["id"]): row for row in products}
    missing = [pid for pid in product_ids if pid not in by_id]
    if missing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Produto(s) não encontrado(s): {', '.join(missing)}")

    for product_id, diff in delta.items():
        row = by_id[product_id]
        current_stock = int(row.get("stock_quantity") or 0)
        new_stock = current_stock - diff
        if new_stock < 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Estoque insuficiente para '{row.get('name') or product_id}'. Disponível: {current_stock}, solicitado adicional: {diff}.",
            )

    for product_id, diff in delta.items():
        row = by_id[product_id]
        current_stock = int(row.get("stock_quantity") or 0)
        new_stock = current_stock - diff
        supabase.table("products").update({"stock_quantity": new_stock}).eq("id", product_id).eq("tenant_id", tenant_id).execute()


def normalize_product_items(items: list[dict] | None) -> list[dict]:
    normalized: list[dict] = []
    for item in items or []:
        product_id = str(item.get("id") or item.get("product_id") or "").strip()
        if not product_id:
            continue
        quantity = _to_positive_int(item.get("quantity") or item.get("qty") or 0, default=0)
        if quantity <= 0:
            continue
        normalized.append({"product_id": product_id, "quantity": quantity})
    return normalized
