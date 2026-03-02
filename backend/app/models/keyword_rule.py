"""
Pydantic models for Keyword Rules (editable via frontend).
"""

from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional

from app.models.lead import LeadStage


class KeywordRuleBase(BaseModel):
    keywords: list[str] = Field(..., min_length=1, description="Lista de palavras-chave")
    target_stage: LeadStage = Field(..., description="Etapa destino no Kanban")
    priority: int = Field(default=1, ge=0, le=10, description="Prioridade (maior = mais prioridade)")
    label: Optional[str] = Field(None, max_length=100, description="Nome descritivo da regra")
    is_active: bool = True


class KeywordRuleCreate(KeywordRuleBase):
    pass


class KeywordRuleUpdate(BaseModel):
    keywords: Optional[list[str]] = None
    target_stage: Optional[LeadStage] = None
    priority: Optional[int] = None
    label: Optional[str] = None
    is_active: Optional[bool] = None


class KeywordRuleResponse(KeywordRuleBase):
    id: str
    tenant_id: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
