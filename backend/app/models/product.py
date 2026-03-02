"""
Pydantic models for Products.
Maps to the product cards and table in the Gestão de Produtos page.
"""

from pydantic import BaseModel, Field
from datetime import datetime
from enum import Enum
from typing import Optional


class ProductStatus(str, Enum):
    EM_ESTOQUE = "em_estoque"
    BAIXO_ESTOQUE = "baixo_estoque"
    ESGOTADO = "esgotado"
    RASCUNHO = "rascunho"


class ProductCategory(str, Enum):
    TRADICIONAL = "tradicional"
    DIET_ZERO = "diet_zero"
    GOURMET = "gourmet"
    SAZONAL = "sazonal"


class ProductBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    price: float = Field(..., ge=0, description="Preço unitário em R$")
    weight: Optional[str] = Field(None, description="Peso (ex: 320g)")
    description: Optional[str] = Field(None, max_length=2000)
    category: ProductCategory = ProductCategory.TRADICIONAL
    lot_code: Optional[str] = None
    image_url: Optional[str] = None
    is_active: bool = True


class ProductCreate(ProductBase):
    pass


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    price: Optional[float] = None
    weight: Optional[str] = None
    description: Optional[str] = None
    category: Optional[ProductCategory] = None
    lot_code: Optional[str] = None
    image_url: Optional[str] = None
    is_active: Optional[bool] = None


class ProductResponse(ProductBase):
    id: str
    tenant_id: str
    status: ProductStatus = ProductStatus.EM_ESTOQUE
    created_at: datetime

    model_config = {"from_attributes": True}
