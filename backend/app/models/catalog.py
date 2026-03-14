"""
Pydantic models for dynamic product categories, promotions and catalog search.
"""

from datetime import datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class ProductCategoryBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    slug: str = Field(..., min_length=1, max_length=160, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    description: Optional[str] = Field(None, max_length=500)
    is_active: bool = True


class ProductCategoryCreate(ProductCategoryBase):
    pass


class ProductCategoryUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=120)
    slug: Optional[str] = Field(None, min_length=1, max_length=160, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    description: Optional[str] = Field(None, max_length=500)
    is_active: Optional[bool] = None


class ProductCategoryResponse(ProductCategoryBase):
    id: UUID
    tenant_id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PromotionBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=140)
    slug: str = Field(..., min_length=1, max_length=180, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    description: Optional[str] = Field(None, max_length=1000)
    discount_type: Literal["percent", "fixed"]
    discount_value: float = Field(..., ge=0)
    category_id: Optional[UUID] = None
    starts_at: datetime
    ends_at: Optional[datetime] = None
    priority: int = 0
    is_active: bool = True


class PromotionCreate(PromotionBase):
    product_ids: list[UUID] = Field(default_factory=list)


class PromotionUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=140)
    slug: Optional[str] = Field(None, min_length=1, max_length=180, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    description: Optional[str] = Field(None, max_length=1000)
    discount_type: Optional[Literal["percent", "fixed"]] = None
    discount_value: Optional[float] = Field(None, ge=0)
    category_id: Optional[UUID] = None
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    priority: Optional[int] = None
    is_active: Optional[bool] = None


class PromotionProductsPayload(BaseModel):
    product_ids: list[UUID] = Field(default_factory=list)


class PromotionResponse(PromotionBase):
    id: UUID
    tenant_id: UUID
    product_ids: list[UUID] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CatalogSearchItem(BaseModel):
    id: str
    type: Literal["product", "promotion", "category"]
    label: str
    subtitle: str
    category_id: Optional[str] = None
    product_id: Optional[str] = None
    promotion_id: Optional[str] = None
    price: Optional[float] = None
    discount_type: Optional[Literal["percent", "fixed"]] = None
    discount_value: Optional[float] = None
    is_active: bool


class CatalogSearchResponse(BaseModel):
    items: list[CatalogSearchItem]
    limit: int
    offset: int
    total: int
