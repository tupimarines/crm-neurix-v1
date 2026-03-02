"""
Pydantic models for Orders.
Maps to the Dashboard orders table.
"""

from pydantic import BaseModel, Field
from datetime import datetime
from enum import Enum
from typing import Optional


class PaymentStatus(str, Enum):
    PAGO = "pago"
    PENDENTE = "pendente"
    CANCELADO = "cancelado"


class OrderBase(BaseModel):
    lead_id: Optional[str] = None
    client_name: str = Field(..., min_length=1)
    client_company: Optional[str] = None
    product_summary: str = Field(..., description="Ex: Geleia de Morango (Cx 12un)")
    total: float = Field(..., ge=0)
    payment_status: PaymentStatus = PaymentStatus.PENDENTE


class OrderCreate(OrderBase):
    pass


class OrderUpdate(BaseModel):
    product_summary: Optional[str] = None
    total: Optional[float] = None
    payment_status: Optional[PaymentStatus] = None


class OrderResponse(OrderBase):
    id: str
    tenant_id: str
    created_at: datetime

    model_config = {"from_attributes": True}
