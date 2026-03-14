"""
Pydantic models for Orders.
Maps to the Dashboard orders table.
"""

from pydantic import BaseModel, Field
from datetime import datetime
from enum import Enum
from typing import Optional, Any


class PaymentStatus(str, Enum):
    PAGO = "pago"
    PENDENTE = "pendente"
    CANCELADO = "cancelado"


class OrderBase(BaseModel):
    lead_id: Optional[str] = None
    client_name: str = Field(..., min_length=1)
    client_company: Optional[str] = None
    product_summary: str = Field(..., description="Ex: Geleia de Morango (Cx 12un)")
    products_json: list[dict[str, Any]] = Field(default_factory=list)
    applied_promotions_json: list[dict[str, Any]] = Field(default_factory=list)
    subtotal: float = Field(default=0, ge=0)
    discount_total: float = Field(default=0, ge=0)
    total: float = Field(..., ge=0)
    stage: Optional[str] = None
    notes: Optional[str] = None
    payment_status: PaymentStatus = PaymentStatus.PENDENTE


class OrderCreate(OrderBase):
    pass


class OrderUpdate(BaseModel):
    product_summary: Optional[str] = None
    products_json: Optional[list[dict[str, Any]]] = None
    applied_promotions_json: Optional[list[dict[str, Any]]] = None
    subtotal: Optional[float] = None
    discount_total: Optional[float] = None
    total: Optional[float] = None
    stage: Optional[str] = None
    notes: Optional[str] = None
    payment_status: Optional[PaymentStatus] = None


class OrderResponse(OrderBase):
    id: str
    tenant_id: str
    created_at: datetime

    model_config = {"from_attributes": True}
