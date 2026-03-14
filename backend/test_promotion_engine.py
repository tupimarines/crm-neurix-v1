from datetime import datetime, timedelta, timezone

from app.services.promotion_engine import apply_promotion_discount, select_best_promotion


def test_select_best_promotion_prefers_product_link_then_priority_then_created_at():
    now = datetime.now(timezone.utc)
    candidates = [
        {
            "id": "promo-category-high",
            "link_type": "category",
            "category_id": "cat-1",
            "priority": 100,
            "is_active": True,
            "discount_type": "percent",
            "discount_value": 10,
            "starts_at": (now - timedelta(days=1)).isoformat(),
            "created_at": (now - timedelta(days=2)).isoformat(),
        },
        {
            "id": "promo-product-low",
            "link_type": "product",
            "product_id": "prod-1",
            "priority": 1,
            "is_active": True,
            "discount_type": "percent",
            "discount_value": 5,
            "starts_at": (now - timedelta(days=1)).isoformat(),
            "created_at": (now - timedelta(days=3)).isoformat(),
        },
        {
            "id": "promo-product-newer",
            "link_type": "product",
            "product_id": "prod-1",
            "priority": 1,
            "is_active": True,
            "discount_type": "percent",
            "discount_value": 6,
            "starts_at": (now - timedelta(days=1)).isoformat(),
            "created_at": (now - timedelta(days=1, minutes=1)).isoformat(),
        },
    ]

    selected = select_best_promotion(
        product_id="prod-1",
        category_id="cat-1",
        candidate_promotions=candidates,
        now_utc=now,
    )
    assert selected is not None
    assert selected["id"] == "promo-product-newer"


def test_apply_promotion_discount_percent_and_fixed():
    assert apply_promotion_discount(100.0, {"discount_type": "percent", "discount_value": 12.5}) == 12.5
    assert apply_promotion_discount(100.0, {"discount_type": "fixed", "discount_value": 150}) == 100.0
