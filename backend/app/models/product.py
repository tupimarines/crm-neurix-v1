"""
Pydantic models for Products.
Maps to the product cards and table in the Gestão de Produtos page.
"""

from pydantic import BaseModel, Field
from datetime import datetime
from enum import Enum
from typing import Optional
from uuid import UUID


class ProductStatus(str, Enum):
    EM_ESTOQUE = "em_estoque"
    BAIXO_ESTOQUE = "baixo_estoque"
    ESGOTADO = "esgotado"
    RASCUNHO = "rascunho"


class ProductBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    price: float = Field(..., ge=0, description="Preço unitário em R$")
    weight: Optional[str] = Field(None, description="Peso (ex: 320g)")
    description: Optional[str] = Field(None, max_length=2000)
    # Legacy plain-text category kept for backward compatibility reads.
    category: Optional[str] = Field(None, description="Categoria legada (deprecated)")
    # New dynamic category model.
    category_id: Optional[UUID] = None
    category_slug: Optional[str] = None
    lot_code: Optional[str] = None
    image_url: Optional[str] = None
    stock_quantity: int = Field(default=0, ge=0, description="Quantidade atual em estoque")
    is_active: bool = True


class ProductCreate(ProductBase):
    pass


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    price: Optional[float] = None
    weight: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    category_id: Optional[UUID] = None
    category_slug: Optional[str] = None
    lot_code: Optional[str] = None
    image_url: Optional[str] = None
    stock_quantity: Optional[int] = Field(default=None, ge=0)
    is_active: Optional[bool] = None


class ProductResponse(ProductBase):
    id: str
    tenant_id: str
    status: ProductStatus = ProductStatus.EM_ESTOQUE
    created_at: datetime

    model_config = {"from_attributes": True}
