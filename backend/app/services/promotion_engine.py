"""
Promotion selection and pricing engine.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Any


def round_money(value: float | Decimal) -> float:
    dec = Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return float(dec)


def _to_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def is_promotion_active(promotion: dict[str, Any], now_utc: datetime) -> bool:
    if not promotion.get("is_active", False):
        return False
    starts_at = promotion.get("starts_at")
    ends_at = promotion.get("ends_at")
    if not starts_at:
        return False

    start = _to_utc(starts_at if isinstance(starts_at, datetime) else datetime.fromisoformat(starts_at.replace("Z", "+00:00")))
    if now_utc < start:
        return False
    if ends_at:
        end = _to_utc(ends_at if isinstance(ends_at, datetime) else datetime.fromisoformat(ends_at.replace("Z", "+00:00")))
        if now_utc > end:
            return False
    return True


def select_best_promotion(
    *,
    product_id: str,
    category_id: str | None,
    candidate_promotions: list[dict[str, Any]],
    now_utc: datetime,
) -> dict[str, Any] | None:
    active = [p for p in candidate_promotions if is_promotion_active(p, now_utc)]
    if not active:
        return None

    def rank(p: dict[str, Any]) -> tuple[int, int, datetime]:
        # product-linked > category-linked
        linked_type = 1 if str(p.get("link_type", "")).lower() == "product" else 0
        priority = int(p.get("priority") or 0)
        created_at_raw = p.get("created_at")
        if isinstance(created_at_raw, datetime):
            created_at = _to_utc(created_at_raw)
        elif isinstance(created_at_raw, str):
            created_at = _to_utc(datetime.fromisoformat(created_at_raw.replace("Z", "+00:00")))
        else:
            created_at = datetime.fromtimestamp(0, tz=timezone.utc)
        return (linked_type, priority, created_at)

    # Filter to product/category applicability first.
    applicable: list[dict[str, Any]] = []
    for p in active:
        link_type = str(p.get("link_type", "")).lower()
        if link_type == "product" and str(p.get("product_id")) == str(product_id):
            applicable.append(p)
        elif link_type == "category" and category_id and str(p.get("category_id")) == str(category_id):
            applicable.append(p)

    if not applicable:
        return None

    applicable.sort(key=rank, reverse=True)
    return applicable[0]


@dataclass
class PricedItem:
    product_id: str
    name: str
    quantity: int
    unit_price: float
    line_subtotal: float
    line_discount: float
    line_total: float
    category_id: str | None
    applied_promotion: dict[str, Any] | None


def apply_promotion_discount(base_amount: float, promotion: dict[str, Any] | None) -> float:
    if not promotion:
        return 0.0
    discount_type = promotion.get("discount_type")
    discount_value = float(promotion.get("discount_value") or 0)
    if discount_type == "percent":
        return round_money(base_amount * (discount_value / 100.0))
    if discount_type == "fixed":
        return round_money(min(base_amount, discount_value))
    return 0.0

