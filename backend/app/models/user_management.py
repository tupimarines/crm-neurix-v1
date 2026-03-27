"""
Modelos — gestão de usuários (Sprint 4): criação via Auth Admin + perfil + membros.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator


class OrgMembershipPublic(BaseModel):
    organization_id: str
    role: str
    assigned_funnel_id: Optional[str] = None


class OrganizationUserCreate(BaseModel):
    organization_id: str = Field(..., min_length=1)
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    full_name: str = Field(..., min_length=1, max_length=500)
    company_name: Optional[str] = Field(None, max_length=500)
    phones: list[str] = Field(default_factory=list)
    role: Literal["admin", "read_only"]
    assigned_funnel_id: Optional[str] = None

    @field_validator("phones")
    @classmethod
    def strip_phones(cls, v: list[str]) -> list[str]:
        return [p.strip() for p in v if p and str(p).strip()]

    @model_validator(mode="after")
    def funnel_rule(self):
        if self.role == "read_only":
            if not self.assigned_funnel_id:
                raise ValueError("assigned_funnel_id é obrigatório para usuário read_only.")
        elif self.role == "admin" and self.assigned_funnel_id is not None:
            raise ValueError("assigned_funnel_id deve ser omitido para administrador.")
        return self


class OrganizationUserUpdate(BaseModel):
    full_name: Optional[str] = Field(None, min_length=1, max_length=500)
    company_name: Optional[str] = Field(None, max_length=500)
    phones: Optional[list[str]] = None
    role: Optional[Literal["admin", "read_only"]] = None
    assigned_funnel_id: Optional[str] = None

    @field_validator("phones")
    @classmethod
    def strip_phones(cls, v: Optional[list[str]]) -> Optional[list[str]]:
        if v is None:
            return None
        return [p.strip() for p in v if p and str(p).strip()]

    @model_validator(mode="after")
    def funnel_rule(self):
        if self.role == "admin" and self.assigned_funnel_id is not None:
            raise ValueError("assigned_funnel_id deve ser omitido ao definir role admin.")
        return self


class UserDetailResponse(BaseModel):
    id: str
    email: Optional[str] = None
    full_name: Optional[str] = None
    company_name: Optional[str] = None
    phones: list[str] = Field(default_factory=list)
    memberships: list[OrgMembershipPublic] = Field(default_factory=list)


class OrganizationUserResponse(BaseModel):
    id: str
    email: Optional[str] = None
    full_name: Optional[str] = None
    company_name: Optional[str] = None
    phones: list[str] = Field(default_factory=list)
    organization_id: str
    role: str
    assigned_funnel_id: Optional[str] = None
    created_at: datetime
