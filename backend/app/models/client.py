"""
Modelos Pydantic — clientes CRM (`crm_clients`).
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

from app.validators.br_documents import digits_only, is_valid_cnpj, is_valid_cpf, normalize_cpf_cnpj


class CrmClientBase(BaseModel):
    person_type: str = Field(..., pattern="^(PF|PJ)$")
    display_name: str = Field(..., min_length=1, max_length=500)
    contact_name: Optional[str] = Field(None, max_length=500)
    phones: list[str] = Field(default_factory=list)
    address_line1: Optional[str] = Field(None, max_length=500)
    address_line2: Optional[str] = Field(None, max_length=500)
    neighborhood: Optional[str] = Field(None, max_length=200)
    postal_code: Optional[str] = Field(None, max_length=20)
    city: Optional[str] = Field(None, max_length=200)
    state: Optional[str] = Field(None, max_length=2)
    complement: Optional[str] = Field(None, max_length=500)
    no_number: Optional[bool] = False
    dead_end_street: Optional[bool] = False


class CrmClientCreate(CrmClientBase):
    """Criação — CPF/CNPJ validados quando informados."""

    cpf: Optional[str] = None
    cnpj: Optional[str] = None
    tenant_id: Optional[str] = Field(
        None,
        description="Obrigatório para superadmin; ignorado para demais (usa tenant do JWT ou escopo org).",
    )

    @field_validator("phones", mode="before")
    @classmethod
    def coerce_phones(cls, v: Any) -> list[str]:
        if v is None:
            return []
        if not isinstance(v, list):
            raise ValueError("phones deve ser uma lista de strings.")
        out: list[str] = []
        for p in v:
            s = str(p).strip()
            if s:
                out.append(s[:80])
        return out

    @model_validator(mode="after")
    def validate_documents(self) -> "CrmClientCreate":
        cpf_d = normalize_cpf_cnpj(self.cpf)
        cnpj_d = normalize_cpf_cnpj(self.cnpj)
        if self.person_type == "PF":
            if cnpj_d:
                raise ValueError("Pessoa física não deve ter CNPJ.")
            if cpf_d:
                if len(cpf_d) != 11:
                    raise ValueError("CPF deve ter 11 dígitos.")
                if not is_valid_cpf(cpf_d):
                    raise ValueError("CPF inválido.")
            self.cpf = cpf_d
            self.cnpj = None
        else:
            if cpf_d:
                raise ValueError("Pessoa jurídica não deve ter CPF no cadastro principal.")
            if not cnpj_d:
                raise ValueError("CNPJ é obrigatório para pessoa jurídica.")
            if len(cnpj_d) != 14:
                raise ValueError("CNPJ deve ter 14 dígitos.")
            if not is_valid_cnpj(cnpj_d):
                raise ValueError("CNPJ inválido.")
            self.cnpj = cnpj_d
            self.cpf = None
        return self


class CrmClientUpdate(BaseModel):
    """Atualização parcial — valida documentos quando enviados."""

    person_type: Optional[str] = Field(None, pattern="^(PF|PJ)$")
    display_name: Optional[str] = Field(None, min_length=1, max_length=500)
    contact_name: Optional[str] = Field(None, max_length=500)
    phones: Optional[list[str]] = None
    cpf: Optional[str] = None
    cnpj: Optional[str] = None
    address_line1: Optional[str] = Field(None, max_length=500)
    address_line2: Optional[str] = Field(None, max_length=500)
    neighborhood: Optional[str] = Field(None, max_length=200)
    postal_code: Optional[str] = Field(None, max_length=20)
    city: Optional[str] = Field(None, max_length=200)
    state: Optional[str] = Field(None, max_length=2)
    complement: Optional[str] = Field(None, max_length=500)
    no_number: Optional[bool] = None
    dead_end_street: Optional[bool] = None

    @field_validator("phones", mode="before")
    @classmethod
    def coerce_phones(cls, v: Any) -> Optional[list[str]]:
        if v is None:
            return None
        if not isinstance(v, list):
            raise ValueError("phones deve ser uma lista de strings.")
        out: list[str] = []
        for p in v:
            s = str(p).strip()
            if s:
                out.append(s[:80])
        return out

    @field_validator("cpf", mode="before")
    @classmethod
    def validate_cpf_field(cls, v: Any) -> Optional[str]:
        if v is None:
            return None
        d = normalize_cpf_cnpj(str(v))
        if not d:
            return None
        if len(d) != 11 or not is_valid_cpf(d):
            raise ValueError("CPF inválido.")
        return d

    @field_validator("cnpj", mode="before")
    @classmethod
    def validate_cnpj_field(cls, v: Any) -> Optional[str]:
        if v is None:
            return None
        d = normalize_cpf_cnpj(str(v))
        if not d:
            return None
        if len(d) != 14 or not is_valid_cnpj(d):
            raise ValueError("CNPJ inválido.")
        return d

    @model_validator(mode="after")
    def cross_check_pf_pj(self) -> "CrmClientUpdate":
        if self.person_type == "PF" and self.cnpj:
            raise ValueError("Pessoa física não deve ter CNPJ.")
        if self.person_type == "PJ" and self.cpf:
            raise ValueError("Pessoa jurídica não deve ter CPF no cadastro principal.")
        return self


def parse_ts(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value
    if value is None:
        raise ValueError("Timestamp ausente.")
    return datetime.fromisoformat(str(value).replace("Z", "+00:00"))


class CrmClientResponse(BaseModel):
    id: str
    tenant_id: str
    person_type: str
    cpf: Optional[str]
    cnpj: Optional[str]
    display_name: str
    contact_name: Optional[str]
    phones: list[Any]
    address_line1: Optional[str]
    address_line2: Optional[str]
    neighborhood: Optional[str]
    postal_code: Optional[str]
    city: Optional[str]
    state: Optional[str]
    complement: Optional[str]
    no_number: Optional[bool]
    dead_end_street: Optional[bool]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


def crm_client_from_row(row: dict[str, Any]) -> CrmClientResponse:
    phones = row.get("phones")
    if not isinstance(phones, list):
        phones = []
    return CrmClientResponse(
        id=str(row["id"]),
        tenant_id=str(row["tenant_id"]),
        person_type=row["person_type"],
        cpf=row.get("cpf"),
        cnpj=row.get("cnpj"),
        display_name=row["display_name"],
        contact_name=row.get("contact_name"),
        phones=phones,
        address_line1=row.get("address_line1"),
        address_line2=row.get("address_line2"),
        neighborhood=row.get("neighborhood"),
        postal_code=row.get("postal_code"),
        city=row.get("city"),
        state=row.get("state"),
        complement=row.get("complement"),
        no_number=row.get("no_number"),
        dead_end_street=row.get("dead_end_street"),
        created_at=parse_ts(row.get("created_at")),
        updated_at=parse_ts(row.get("updated_at")),
    )
