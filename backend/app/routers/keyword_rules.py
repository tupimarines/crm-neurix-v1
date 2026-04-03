"""
Keyword Rules Router — CRUD for editable keyword engine rules.
Allows users to configure which keywords trigger stage transitions in the Kanban.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from supabase import Client as SupabaseClient

from app.dependencies import get_supabase, get_current_user
from app.models.keyword_rule import KeywordRuleCreate, KeywordRuleUpdate, KeywordRuleResponse

router = APIRouter()


@router.get("/", response_model=list[KeywordRuleResponse])
async def list_keyword_rules(
    user=Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_supabase),
):
    """List all keyword rules for the current tenant."""
    response = supabase.table("keyword_rules") \
        .select("*") \
        .eq("tenant_id", user.id) \
        .order("priority", desc=True) \
        .execute()
    return [KeywordRuleResponse(**row) for row in (response.data or [])]


@router.post("/", response_model=KeywordRuleResponse, status_code=status.HTTP_201_CREATED)
async def create_keyword_rule(
    payload: KeywordRuleCreate,
    user=Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_supabase),
):
    """Create a new keyword rule."""
    data = payload.model_dump()
    data["tenant_id"] = user.id

    response = supabase.table("keyword_rules").insert(data).execute()

    if not response.data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Erro ao criar regra.")

    return KeywordRuleResponse(**response.data[0])


@router.patch("/{rule_id}", response_model=KeywordRuleResponse)
async def update_keyword_rule(
    rule_id: str,
    payload: KeywordRuleUpdate,
    user=Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_supabase),
):
    """Update a keyword rule."""
    update_data = payload.model_dump(exclude_unset=True)

    if not update_data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nenhum campo para atualizar.")

    response = supabase.table("keyword_rules") \
        .update(update_data) \
        .eq("id", rule_id) \
        .eq("tenant_id", user.id) \
        .execute()

    if not response.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Regra não encontrada.")

    return KeywordRuleResponse(**response.data[0])


@router.delete("/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_keyword_rule(
    rule_id: str,
    user=Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_supabase),
):
    """Delete a keyword rule."""
    supabase.table("keyword_rules").delete().eq("id", rule_id).eq("tenant_id", user.id).execute()


@router.post("/seed-defaults", response_model=list[KeywordRuleResponse])
async def seed_default_rules(
    user=Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_supabase),
):
    """Populate default keyword rules for a new tenant.
    Uses dynamic stage names from the tenant's pipeline_stages instead of legacy hardcoded slugs.
    If no pipeline_stages exist, creates rules with empty target_stage (inactive until stages are configured).
    """
    stages_res = (
        supabase.table("pipeline_stages")
        .select("name, order_position")
        .eq("tenant_id", user.id)
        .order("order_position")
        .execute()
    )
    stage_names = [str(row["name"]).strip() for row in (stages_res.data or [])]

    def _stage_at(index: int) -> str:
        return stage_names[index] if index < len(stage_names) else ""

    defaults = [
        {
            "tenant_id": user.id,
            "label": "Interesse em Sabores",
            "keywords": ["cardápio", "sabores", "sabor", "catálogo", "tipos", "frutas",
                         "morango", "damasco", "laranja", "figo", "me manda", "quais tem",
                         "opções", "variedade"],
            "target_stage": _stage_at(1),
            "priority": 1,
            "is_active": bool(_stage_at(1)),
        },
        {
            "tenant_id": user.id,
            "label": "Intenção de Compra",
            "keywords": ["quero comprar", "fechar", "pedido", "pagar", "pagamento",
                         "pix", "transferência", "boleto", "nota fiscal",
                         "quanto fica", "valor total", "preço", "desconto",
                         "comprar", "encomenda", "encomendar"],
            "target_stage": _stage_at(2),
            "priority": 2,
            "is_active": bool(_stage_at(2)),
        },
        {
            "tenant_id": user.id,
            "label": "Pagamento / Entrega Confirmada",
            "keywords": ["paguei", "comprovante", "transferi", "enviado",
                         "entrega", "rastreio", "recebido", "obrigado"],
            "target_stage": _stage_at(3),
            "priority": 3,
            "is_active": bool(_stage_at(3)),
        },
    ]

    response = supabase.table("keyword_rules").insert(defaults).execute()

    if not response.data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Erro ao criar regras padrão.")

    return [KeywordRuleResponse(**row) for row in response.data]
