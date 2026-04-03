"""
Pydantic models for Leads / Kanban Cards.
Maps directly to the Kanban board columns in the frontend.
"""

from pydantic import BaseModel, Field
from datetime import datetime
from enum import Enum
from typing import Optional


class LeadPriority(str, Enum):
    ALTA = "alta"
    MEDIA = "media"
    BAIXA = "baixa"


class LeadBase(BaseModel):
    company_name: str = Field(..., min_length=1, max_length=200, description="Nome da empresa")
    contact_name: str = Field(..., min_length=1, max_length=200, description="Nome do contato")
    phone: Optional[str] = Field(None, max_length=50, description="Telefone do contato")
    stage: str = ""
    priority: Optional[LeadPriority] = None
    value: float = Field(default=0.0, ge=0, description="Valor estimado em R$")
    notes: Optional[str] = Field(None, max_length=1000, description="Observações sobre o lead")
    whatsapp_chat_id: Optional[str] = None
    products_json: Optional[list[dict]] = Field(None, description="Produtos e quantidades selecionados")
    stock_reserved_json: Optional[list[dict]] = Field(None, description="Reserva de estoque ativa por produto")
    purchase_history_json: Optional[list[dict]] = Field(None, description="Histórico de compras fechadas do lead")


class LeadCreate(LeadBase):
    funnel_id: Optional[str] = Field(
        None,
        description="Funil do board ao criar pelo Kanban; default = funil Default do tenant.",
    )
    client_id: Optional[str] = Field(
        None,
        description="UUID do crm_client vinculado; se omitido e phone fornecido, resolve automaticamente.",
    )


class LeadUpdate(BaseModel):
    company_name: Optional[str] = None
    contact_name: Optional[str] = None
    phone: Optional[str] = None
    priority: Optional[LeadPriority] = None
    value: Optional[float] = None
    notes: Optional[str] = None
    products_json: Optional[list[dict]] = None
    stock_reserved_json: Optional[list[dict]] = None
    purchase_history_json: Optional[list[dict]] = None
    client_id: Optional[str] = None


class LeadMoveStage(BaseModel):
    stage: str
    stage_id: Optional[str] = None


class LeadResponse(LeadBase):
    id: str
    tenant_id: str
    created_at: datetime
    updated_at: datetime
    funnel_id: Optional[str] = None
    inbox_id: Optional[str] = None
    client_id: Optional[str] = None

    model_config = {"from_attributes": True}


class KanbanColumn(BaseModel):
    stage: str
    stage_id: Optional[str] = None
    stage_version: Optional[int] = None
    stage_is_conversion: Optional[bool] = None
    label: str
    count: int
    total_value: float
    leads: list[LeadResponse]


class KanbanBoard(BaseModel):
    columns: list[KanbanColumn]
    funnel_id: Optional[str] = Field(None, description="Funil efetivamente carregado (read_only: sempre o atribuído).")
