"""
Pydantic models — organizações e membros (Sprint 3).
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


class OrganizationCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=500)


class OrganizationUpdate(BaseModel):
    name: str = Field(..., min_length=1, max_length=500)


class OrganizationResponse(BaseModel):
    id: str
    name: str
    created_at: datetime
    updated_at: datetime


class OrganizationMemberCreate(BaseModel):
    user_id: str = Field(..., min_length=1)
    role: Literal["admin", "read_only"]
    assigned_funnel_id: Optional[str] = None


class OrganizationMemberUpdate(BaseModel):
    role: Optional[Literal["admin", "read_only"]] = None
    assigned_funnel_id: Optional[str] = None


class OrganizationMemberResponse(BaseModel):
    id: str
    organization_id: str
    user_id: str
    role: str
    assigned_funnel_id: Optional[str] = None
    created_at: datetime
