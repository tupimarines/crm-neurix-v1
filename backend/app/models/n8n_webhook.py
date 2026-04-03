"""
Pydantic models and helpers for the n8n unified webhook endpoint.
"""

import re
from typing import Literal, Optional

from pydantic import BaseModel, Field


class OrderItem(BaseModel):
    product_id: Optional[str] = None
    product: str = Field(max_length=255)
    quantity: int
    total: str


class NoteTimelineEntry(BaseModel):
    content: str = Field(max_length=2000)
    timestamp: Optional[str] = None


class N8nWebhookPayload(BaseModel):
    instance_token: str
    whatsapp_chat_id: str
    phone: Optional[str] = Field(None, max_length=50)
    lead_name: Optional[str] = Field(None, max_length=200)
    lead_cnpj: Optional[str] = Field(None, max_length=20)
    intent: Literal["perfil_b2c", "perfil_b2b", "perfil_revenda", "cart_update", "pedido"]
    button_id: Optional[str] = None
    order_summary: Optional[list[OrderItem]] = None
    payment_method: Optional[str] = None
    total_value: Optional[str] = None
    note_timeline: Optional[list[NoteTimelineEntry]] = None


class N8nWebhookResponse(BaseModel):
    status: str
    lead_id: Optional[str] = None
    client_id: Optional[str] = None
    stage: Optional[str] = None
    order_id: Optional[str] = None
    message: str
    warnings: list[str] = []


# ── Helpers ──

_BRL_STRIP_RE = re.compile(r"[R$\s]")


def parse_brl_to_float(val: str | None) -> float:
    """Parse Brazilian Real strings like 'R$ 112,00' → 112.0.

    Handles BRL ("1.112,00" → 1112.0) and plain ("112.00" → 112.0).
    If the string contains a comma, dots are thousands separators.
    If no comma, dots are treated as decimal separators.
    """
    if not val:
        return 0.0
    try:
        cleaned = _BRL_STRIP_RE.sub("", val)
        if "," in cleaned:
            cleaned = cleaned.replace(".", "").replace(",", ".")
        return float(cleaned)
    except (ValueError, TypeError):
        return 0.0


def build_products_json(
    items: list[OrderItem],
    products_db: list[dict],
    tenant_id: str,
) -> tuple[list[dict], list[str]]:
    """Convert n8n OrderItems to the products_json format used by Kanban UI.
    Returns (products_json_list, warnings_list)."""
    by_id: dict[str, dict] = {}
    by_name_lower: dict[str, dict] = {}
    for p in products_db:
        pid = str(p.get("id") or "")
        if pid:
            by_id[pid] = p
        name = str(p.get("name") or "").strip().lower()
        if name:
            by_name_lower[name] = p

    result: list[dict] = []
    warnings: list[str] = []

    for item in items:
        matched: dict | None = None

        if item.product_id:
            matched = by_id.get(item.product_id)
            if matched and str(matched.get("tenant_id", "")) != tenant_id:
                warnings.append(f"product_id '{item.product_id}' pertence a outro tenant — ignorado")
                matched = None

        if not matched:
            matched = by_name_lower.get(item.product.strip().lower())

        unit_price = _derive_unit_price(item, matched)
        line_subtotal = round(unit_price * item.quantity, 2)
        line_total_parsed = parse_brl_to_float(item.total)
        line_total = line_total_parsed if line_total_parsed > 0 else line_subtotal

        if matched:
            pid = str(matched["id"])
            entry = {
                "id": pid,
                "product_id": pid,
                "name": str(matched.get("name") or item.product),
                "price": float(matched.get("price") or unit_price),
                "quantity": item.quantity,
                "qty": item.quantity,
                "category_id": str(matched.get("category_id")) if matched.get("category_id") else None,
                "line_subtotal": round(float(matched.get("price") or unit_price) * item.quantity, 2),
                "line_discount": 0.0,
                "line_total": round(float(matched.get("price") or unit_price) * item.quantity, 2),
                "applied_promotion_name": None,
            }
        else:
            warnings.append(f"Produto '{item.product}' não encontrado no CRM — marcado como unmatched")
            entry = {
                "id": "",
                "product_id": item.product_id or "",
                "name": item.product,
                "price": unit_price,
                "quantity": item.quantity,
                "qty": item.quantity,
                "category_id": None,
                "line_subtotal": line_subtotal,
                "line_discount": 0.0,
                "line_total": line_total,
                "applied_promotion_name": None,
                "unmatched": True,
            }

        result.append(entry)

    return result, warnings


def _derive_unit_price(item: OrderItem, matched_product: dict | None) -> float:
    if matched_product:
        return float(matched_product.get("price") or 0.0)
    total = parse_brl_to_float(item.total)
    return round(total / max(item.quantity, 1), 2)


def generate_product_summary(items: list[OrderItem]) -> str:
    parts = [f"{item.quantity}x {item.product}" for item in items]
    return ", ".join(parts) if parts else "Sem itens"


def generate_client_name(
    lead_row: dict,
    payload: N8nWebhookPayload,
    client_row: dict | None,
) -> str:
    if client_row and client_row.get("display_name"):
        return str(client_row["display_name"])
    if payload.lead_name:
        return payload.lead_name
    for key in ("contact_name", "company_name"):
        val = lead_row.get(key)
        if val and str(val).strip():
            return str(val).strip()
    return "Cliente WhatsApp"
