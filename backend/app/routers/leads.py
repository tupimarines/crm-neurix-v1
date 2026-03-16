"""
Leads Router — CRUD + Kanban Stage Management + Chat Mirror
Provides the data for the Funil de Vendas Kanban board and WhatsApp chat integration.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query, BackgroundTasks
from supabase import Client as SupabaseClient
from typing import Optional
from pydantic import BaseModel, Field
from time import perf_counter
from datetime import datetime, timezone

from app.dependencies import get_supabase, get_current_user
from app.models.lead import (
    LeadCreate, LeadUpdate, LeadMoveStage, LeadResponse,
    KanbanBoard, KanbanColumn, LeadStage,
)
from app.models.chat_message import SendMessagePayload
from app.observability import get_logger, metrics
from app.services.uazapi_service import get_uazapi_service
from app.services.promotion_engine import apply_promotion_discount, round_money, select_best_promotion

router = APIRouter()
logger = get_logger("leads")

STAGE_LABELS = {
    LeadStage.CONTATO_INICIAL: "Contato Inicial",
    LeadStage.ESCOLHENDO_SABORES: "Escolhendo Sabores",
    LeadStage.AGUARDANDO_PAGAMENTO: "Aguardando Pagamento",
    LeadStage.ENVIADO: "Enviado",
}


def _db_error_detail(exc: Exception) -> str:
    for attr in ("details", "message", "msg"):
        val = getattr(exc, attr, None)
        if isinstance(val, str) and val.strip():
            return val
    text = str(exc)
    return text or "Erro inesperado no banco."


def _is_missing_column_error(detail: str, column_name: str) -> bool:
    lowered = detail.lower()
    return "column" in lowered and column_name.lower() in lowered and ("does not exist" in lowered or "não existe" in lowered)


def _to_positive_int(value, default: int = 0) -> int:
    try:
        parsed = int(value)
        return parsed if parsed > 0 else default
    except Exception:
        return default


def _normalize_reserved_items(items: list[dict] | None) -> list[dict]:
    normalized: list[dict] = []
    for item in (items or []):
        product_id = str(item.get("product_id") or item.get("id") or "").strip()
        if not product_id:
            continue
        quantity = _to_positive_int(item.get("quantity") or item.get("qty") or 0, default=0)
        if quantity <= 0:
            continue
        normalized.append({"product_id": product_id, "quantity": quantity})
    return normalized


def _aggregate_reserved(items: list[dict] | None) -> dict[str, int]:
    aggregated: dict[str, int] = {}
    for item in _normalize_reserved_items(items):
        aggregated[item["product_id"]] = aggregated.get(item["product_id"], 0) + int(item["quantity"])
    return aggregated


def _compute_stock_delta(previous_reserved: list[dict] | None, next_products: list[dict] | None) -> tuple[list[dict], dict[str, int]]:
    previous = _aggregate_reserved(previous_reserved)
    next_reserved = _normalize_reserved_items(next_products)
    nxt = _aggregate_reserved(next_reserved)
    product_ids = set(previous.keys()) | set(nxt.keys())
    delta: dict[str, int] = {}
    for product_id in product_ids:
        # Positive delta => reserve more (decrease stock)
        # Negative delta => release reservation (increase stock)
        diff = nxt.get(product_id, 0) - previous.get(product_id, 0)
        if diff != 0:
            delta[product_id] = diff
    return next_reserved, delta


def _invert_delta(delta: dict[str, int]) -> dict[str, int]:
    return {product_id: -qty for product_id, qty in delta.items()}


def _apply_stock_delta(
    *,
    supabase: SupabaseClient,
    tenant_id: str,
    delta: dict[str, int],
) -> None:
    if not delta:
        return
    product_ids = list(delta.keys())
    products = (
        supabase.table("products")
        .select("id, name, stock_quantity, is_active")
        .eq("tenant_id", tenant_id)
        .in_("id", product_ids)
        .execute()
    ).data or []
    by_id = {str(row["id"]): row for row in products}
    missing = [pid for pid in product_ids if pid not in by_id]
    if missing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Produto(s) não encontrado(s): {', '.join(missing)}")

    for product_id, diff in delta.items():
        row = by_id[product_id]
        current_stock = int(row.get("stock_quantity") or 0)
        new_stock = current_stock - diff
        if new_stock < 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Estoque insuficiente para '{row.get('name') or product_id}'. Disponível: {current_stock}, solicitado adicional: {diff}.",
            )

    for product_id, diff in delta.items():
        row = by_id[product_id]
        current_stock = int(row.get("stock_quantity") or 0)
        new_stock = current_stock - diff
        supabase.table("products").update({"stock_quantity": new_stock}).eq("id", product_id).eq("tenant_id", tenant_id).execute()


def _normalize_product_items(items: list[dict] | None) -> list[dict]:
    normalized: list[dict] = []
    for item in items or []:
        product_id = str(item.get("id") or item.get("product_id") or "").strip()
        if not product_id:
            continue
        quantity = _to_positive_int(item.get("quantity") or item.get("qty") or 0, default=0)
        if quantity <= 0:
            continue
        normalized.append({"product_id": product_id, "quantity": quantity})
    return normalized


def _price_lead_products_with_promotions(
    *,
    supabase: SupabaseClient,
    tenant_id: str,
    products_json: list[dict] | None,
) -> tuple[float, list[dict]]:
    normalized_items = _normalize_product_items(products_json)
    if not normalized_items:
        return 0.0, []

    product_ids = list({item["product_id"] for item in normalized_items})
    product_rows = (
        supabase.table("products")
        .select("id, name, price, category_id, is_active")
        .eq("tenant_id", tenant_id)
        .in_("id", product_ids)
        .execute()
    ).data or []
    products_map = {str(row["id"]): row for row in product_rows}
    missing_ids = [pid for pid in product_ids if pid not in products_map]
    if missing_ids:
        raise HTTPException(status_code=400, detail=f"Produtos não encontrados: {', '.join(missing_ids)}")

    subtotal = 0.0
    fallback_lines: list[dict] = []
    for item in normalized_items:
        product = products_map[item["product_id"]]
        quantity = int(item["quantity"])
        unit_price = float(product.get("price") or 0.0)
        line_subtotal = round_money(unit_price * quantity)
        subtotal += line_subtotal
        fallback_lines.append(
            {
                "id": str(product["id"]),
                "product_id": str(product["id"]),
                "name": product.get("name") or "",
                "price": unit_price,
                "quantity": quantity,
                "qty": quantity,
                "category_id": str(product.get("category_id")) if product.get("category_id") else None,
                "line_subtotal": line_subtotal,
                "line_discount": 0.0,
                "line_total": line_subtotal,
                "applied_promotion_name": None,
            }
        )
    subtotal = round_money(subtotal)

    # Compatibility safety: if promotions schema isn't available, keep subtotal.
    try:
        promotions_rows = (
            supabase.table("promotions")
            .select("id, name, discount_type, discount_value, category_id, starts_at, ends_at, priority, is_active, created_at")
            .eq("tenant_id", tenant_id)
            .execute()
        ).data or []
    except Exception:
        return subtotal, fallback_lines

    if not promotions_rows:
        return subtotal, fallback_lines

    promotion_ids = [row["id"] for row in promotions_rows]
    category_ids = list(
        {
            str(products_map[item["product_id"]].get("category_id"))
            for item in normalized_items
            if products_map[item["product_id"]].get("category_id")
        }
    )

    link_rows = []
    try:
        if promotion_ids and product_ids:
            link_rows = (
                supabase.table("promotion_products")
                .select("promotion_id, product_id")
                .eq("tenant_id", tenant_id)
                .in_("promotion_id", promotion_ids)
                .in_("product_id", product_ids)
                .execute()
            ).data or []
    except Exception:
        link_rows = []

    linked_by_product: dict[str, list[dict]] = {}
    linked_by_category: dict[str, list[dict]] = {}
    promo_by_id = {str(row["id"]): row for row in promotions_rows}
    for link in link_rows:
        promo = promo_by_id.get(str(link.get("promotion_id")))
        if not promo:
            continue
        enriched = {**promo, "link_type": "product", "product_id": str(link.get("product_id"))}
        linked_by_product.setdefault(str(link.get("product_id")), []).append(enriched)

    for promo in promotions_rows:
        category_id = promo.get("category_id")
        if category_id and str(category_id) in category_ids:
            linked_by_category.setdefault(str(category_id), []).append({**promo, "link_type": "category"})

    now_utc = datetime.now(timezone.utc)
    discount_total = 0.0
    resolved_lines: list[dict] = []
    for item in normalized_items:
        product = products_map[item["product_id"]]
        unit_price = float(product.get("price") or 0.0)
        quantity = int(item["quantity"])
        line_subtotal = round_money(unit_price * quantity)
        category_id = str(product.get("category_id")) if product.get("category_id") else None

        candidates = []
        candidates.extend(linked_by_product.get(str(product["id"]), []))
        if category_id:
            candidates.extend(linked_by_category.get(category_id, []))

        selected = select_best_promotion(
            product_id=str(product["id"]),
            category_id=category_id,
            candidate_promotions=candidates,
            now_utc=now_utc,
        )
        line_discount = round_money(apply_promotion_discount(line_subtotal, selected))
        line_total = round_money(max(line_subtotal - line_discount, 0.0))
        discount_total += line_discount
        resolved_lines.append(
            {
                "id": str(product["id"]),
                "product_id": str(product["id"]),
                "name": product.get("name") or "",
                "price": unit_price,
                "quantity": quantity,
                "qty": quantity,
                "category_id": category_id,
                "line_subtotal": line_subtotal,
                "line_discount": line_discount,
                "line_total": line_total,
                "applied_promotion_name": selected.get("name") if selected else None,
                "applied_promotion_id": str(selected.get("id")) if selected and selected.get("id") else None,
                "applied_discount_type": selected.get("discount_type") if selected else None,
                "applied_discount_value": float(selected.get("discount_value") or 0.0) if selected else None,
            }
        )

    discount_total = round_money(discount_total)
    total = round_money(max(subtotal - discount_total, 0.0))
    return total, resolved_lines


def _list_pipeline_stages_for_response(*, supabase: SupabaseClient, tenant_id: str) -> list[dict]:
    try:
        response = (
            supabase.table("pipeline_stages")
            .select("id, name, order_position, version, is_conversion")
            .eq("tenant_id", tenant_id)
            .order("order_position")
            .execute()
        )
        return response.data or []
    except Exception:
        response = (
            supabase.table("pipeline_stages")
            .select("id, name, order_position, version")
            .eq("tenant_id", tenant_id)
            .order("order_position")
            .execute()
        )
        return response.data or []


class ReorderStageItem(BaseModel):
    id: str
    version: int = Field(..., ge=1)


class ReorderStagesPayload(BaseModel):
    items: list[ReorderStageItem] = Field(..., min_length=1)


class StageCreatePayload(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    is_conversion: bool = False


class StageRenamePayload(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)


class StageDeletePayload(BaseModel):
    fallback_stage_id: str | None = None


@router.get("/kanban", response_model=KanbanBoard)
async def get_kanban_board(
    user=Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_supabase),
):
    """Get all leads organized as a Kanban board with columns."""
    started = perf_counter()
    # 1. Fetch Stages
    stages_response = supabase.table("pipeline_stages") \
        .select("*") \
        .eq("tenant_id", user.id) \
        .order("order_position") \
        .execute()
    
    stages_data = stages_response.data
    
    # Default stages if none exist
    if not stages_data:
        stages_data = [
            {"id": "default-contato", "name": "Contato Inicial", "order_position": 0, "version": 1, "is_conversion": False},
            {"id": "default-escolhendo", "name": "Escolhendo Sabores", "order_position": 1, "version": 1, "is_conversion": False},
            {"id": "default-aguardando", "name": "Aguardando Pagamento", "order_position": 2, "version": 1, "is_conversion": False},
            {"id": "default-enviado", "name": "Enviado", "order_position": 3, "version": 1, "is_conversion": False},
        ]

    # 2. Fetch Leads
    response = supabase.table("leads") \
        .select("*") \
        .eq("tenant_id", user.id) \
        .eq("archived", False) \
        .eq("deleted", False) \
        .order("created_at", desc=False) \
        .execute()

    # 3. Group Leads by Stage Name (or slug)
    leads_by_stage: dict[str, list] = {s["name"]: [] for s in stages_data}
    # Also support mapping by ID if needed, but leads table uses string names
    
    for row in response.data:
        stage_val = row.get("stage", "Contato Inicial")
        # Direct match or case-insensitive match
        matched = False
        for s_name in leads_by_stage.keys():
            if stage_val.lower() == s_name.lower():
                leads_by_stage[s_name].append(LeadResponse(**row))
                matched = True
                break
        
        if not matched and stages_data:
            # Fallback to first stage if no match found
            leads_by_stage[stages_data[0]["name"]].append(LeadResponse(**row))

    # 4. Build Columns
    columns = []
    for stage_info in stages_data:
        name = stage_info["name"]
        stage_leads = leads_by_stage[name]
        columns.append(KanbanColumn(
            stage=name,
            stage_id=stage_info.get("id"),
            stage_version=int(stage_info.get("version") or 1),
            stage_is_conversion=bool(stage_info.get("is_conversion", False)),
            label=name,
            count=len(stage_leads),
            total_value=sum(l.value for l in stage_leads),
            leads=stage_leads,
        ))

    elapsed_ms = (perf_counter() - started) * 1000.0
    metrics.observe("kanban_board", elapsed_ms, ok=True)
    return KanbanBoard(columns=columns)


@router.post("/stages/reorder", status_code=status.HTTP_200_OK)
async def reorder_stages(
    payload: ReorderStagesPayload,
    user=Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_supabase),
):
    started = perf_counter()
    ordered_ids = [item.id for item in payload.items]
    version_by_id = {item.id: item.version for item in payload.items}

    current_response = (
        supabase.table("pipeline_stages")
        .select("id, tenant_id, order_position, version")
        .eq("tenant_id", user.id)
        .order("order_position")
        .execute()
    )
    current_rows = current_response.data or []
    if not current_rows:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nenhuma etapa encontrada para reorder.")

    db_ids = [row["id"] for row in current_rows]
    if set(db_ids) != set(ordered_ids):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payload inválido: etapas ausentes, duplicadas ou de outro tenant.",
        )

    for stage in current_rows:
        expected_version = version_by_id.get(stage["id"])
        if expected_version is None:
            raise HTTPException(status_code=400, detail="Payload inválido: versão ausente.")
        if int(stage.get("version") or 1) != int(expected_version):
            metrics.observe("kanban_reorder", (perf_counter() - started) * 1000.0, ok=False)
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Conflito de versão. Recarregue o Kanban.")

    previous_positions = {row["id"]: row["order_position"] for row in current_rows}
    previous_versions = {row["id"]: int(row.get("version") or 1) for row in current_rows}
    try:
        for idx, stage_id in enumerate(ordered_ids):
            update_res = (
                supabase.table("pipeline_stages")
                .update({"order_position": idx, "version": previous_versions[stage_id] + 1})
                .eq("id", stage_id)
                .eq("tenant_id", user.id)
                .eq("version", previous_versions[stage_id])
                .execute()
            )
            if not update_res.data:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Conflito de versão. Recarregue o Kanban.")
    except HTTPException:
        # Best-effort rollback para manter consistência visual/banco em falha parcial.
        for stage_id, old_position in previous_positions.items():
            supabase.table("pipeline_stages").update(
                {"order_position": old_position, "version": previous_versions[stage_id]}
            ).eq("id", stage_id).eq("tenant_id", user.id).execute()
        metrics.observe("kanban_reorder", (perf_counter() - started) * 1000.0, ok=False)
        logger.warning("kanban_reorder_conflict_or_error", extra={"tenant_id": str(user.id), "error_count": 1})
        raise
    except Exception as exc:
        for stage_id, old_position in previous_positions.items():
            supabase.table("pipeline_stages").update(
                {"order_position": old_position, "version": previous_versions[stage_id]}
            ).eq("id", stage_id).eq("tenant_id", user.id).execute()
        metrics.observe("kanban_reorder", (perf_counter() - started) * 1000.0, ok=False)
        logger.exception("kanban_reorder_failed", extra={"tenant_id": str(user.id)})
        raise HTTPException(status_code=500, detail=f"Erro ao persistir reorder: {str(exc)}")

    refreshed = _list_pipeline_stages_for_response(supabase=supabase, tenant_id=user.id)
    elapsed_ms = (perf_counter() - started) * 1000.0
    metrics.observe("kanban_reorder", elapsed_ms, ok=True)
    logger.info(
        "kanban_reorder_success",
        extra={"tenant_id": str(user.id), "result_count": len(ordered_ids), "elapsed_ms": round(elapsed_ms, 2)},
    )
    return {"stages": refreshed}


@router.post("/stages", status_code=status.HTTP_201_CREATED)
async def create_stage(
    payload: StageCreatePayload,
    user=Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_supabase),
):
    tenant_id = str(user.id)
    existing = (
        supabase.table("pipeline_stages")
        .select("id, order_position")
        .eq("tenant_id", tenant_id)
        .order("order_position", desc=True)
        .limit(1)
        .execute()
    ).data or []
    next_order = int(existing[0]["order_position"]) + 1 if existing else 0
    insert_payload = {
        "tenant_id": tenant_id,
        "name": payload.name.strip(),
        "order_position": next_order,
        "is_conversion": bool(payload.is_conversion),
    }
    try:
        response = (
            supabase.table("pipeline_stages")
            .insert(insert_payload)
            .select("id, name, order_position, version, is_conversion")
            .single()
            .execute()
        )
    except Exception as exc:
        detail = _db_error_detail(exc)
        if _is_missing_column_error(detail, "is_conversion"):
            logger.info("create_stage_fallback", extra={"reason": "is_conversion column missing", "tenant_id": tenant_id})
            try:
                response = (
                    supabase.table("pipeline_stages")
                    .insert(
                        {
                            "tenant_id": tenant_id,
                            "name": payload.name.strip(),
                            "order_position": next_order,
                        }
                    )
                    .select("id, name, order_position, version")
                    .single()
                    .execute()
                )
                if response.data:
                    response.data["is_conversion"] = False
            except Exception as fallback_exc:
                logger.exception("create_stage_fallback_failed", extra={"tenant_id": tenant_id})
                raise HTTPException(
                    status_code=500,
                    detail="Erro ao criar etapa. Execute a migration 005_pipeline_stage_conversion_flag.sql no Supabase.",
                ) from fallback_exc
        else:
            logger.exception("create_stage_failed", extra={"tenant_id": tenant_id, "detail": detail})
            raise HTTPException(status_code=500, detail=f"Erro ao criar etapa: {detail}")
    if not response.data:
        raise HTTPException(status_code=400, detail="Erro ao criar etapa.")
    return response.data


@router.patch("/stages/{stage_id}")
async def rename_stage(
    stage_id: str,
    payload: StageRenamePayload,
    user=Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_supabase),
):
    response = (
        supabase.table("pipeline_stages")
        .update({"name": payload.name.strip()})
        .eq("id", stage_id)
        .eq("tenant_id", user.id)
        .select("id, name, order_position, version")
        .single()
        .execute()
    )
    if not response.data:
        raise HTTPException(status_code=404, detail="Etapa não encontrada.")
    return response.data


@router.delete("/stages/{stage_id}")
async def delete_stage(
    stage_id: str,
    payload: StageDeletePayload,
    user=Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_supabase),
):
    stages = (
        supabase.table("pipeline_stages")
        .select("id, name, order_position")
        .eq("tenant_id", user.id)
        .order("order_position")
        .execute()
    ).data or []
    target = next((s for s in stages if str(s["id"]) == str(stage_id)), None)
    if not target:
        raise HTTPException(status_code=404, detail="Etapa não encontrada.")
    if len(stages) <= 1:
        raise HTTPException(status_code=400, detail="É necessário manter pelo menos uma etapa.")

    fallback = None
    if payload.fallback_stage_id:
        fallback = next((s for s in stages if str(s["id"]) == str(payload.fallback_stage_id) and str(s["id"]) != str(stage_id)), None)
    if not fallback:
        fallback = next((s for s in stages if str(s["id"]) != str(stage_id)), None)
    if not fallback:
        raise HTTPException(status_code=400, detail="Etapa de fallback inválida.")

    # Move leads to fallback by both stage name and legacy id-in-stage field.
    supabase.table("leads").update({"stage": fallback["name"]}).eq("tenant_id", user.id).in_("stage", [target["name"], target["id"]]).execute()
    delete_result = supabase.table("pipeline_stages").delete().eq("id", stage_id).eq("tenant_id", user.id).execute()
    if not delete_result.data:
        raise HTTPException(status_code=400, detail="Erro ao excluir etapa.")

    refreshed = _list_pipeline_stages_for_response(supabase=supabase, tenant_id=user.id)
    return {"fallback_stage_id": fallback["id"], "stages": refreshed}


@router.get("/", response_model=list[LeadResponse])
async def list_leads(
    stage: Optional[str] = None,
    search: Optional[str] = Query(None, min_length=1),
    user=Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_supabase),
):
    """List leads with optional stage and search filters."""
    query = supabase.table("leads").select("*").eq("tenant_id", user.id).order("created_at", desc=True)

    if stage:
        query = query.eq("stage", stage)
    if search:
        query = query.or_(f"company_name.ilike.%{search}%,contact_name.ilike.%{search}%")

    response = query.execute()
    return [LeadResponse(**row) for row in response.data]


@router.post("/", response_model=LeadResponse, status_code=status.HTTP_201_CREATED)
async def create_lead(
    payload: LeadCreate,
    user=Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_supabase),
):
    """Create a new lead/card."""
    data = payload.model_dump()
    data["tenant_id"] = user.id
    previous_reserved: list[dict] = []
    rollback_needed = False
    applied_delta: dict[str, int] = {}

    try:
        next_reserved, applied_delta = _compute_stock_delta(previous_reserved, data.get("products_json") or [])
        _apply_stock_delta(supabase=supabase, tenant_id=user.id, delta=applied_delta)
        rollback_needed = True
        data["stock_reserved_json"] = next_reserved
        if "purchase_history_json" not in data or data["purchase_history_json"] is None:
            data["purchase_history_json"] = []
        priced_value, resolved_lines = _price_lead_products_with_promotions(
            supabase=supabase,
            tenant_id=user.id,
            products_json=data.get("products_json") or [],
        )
        data["value"] = priced_value
        data["products_json"] = resolved_lines

        response = supabase.table("leads").insert(data).execute()
    except Exception:
        if rollback_needed and applied_delta:
            try:
                _apply_stock_delta(supabase=supabase, tenant_id=user.id, delta=_invert_delta(applied_delta))
            except Exception:
                logger.exception("lead_create_stock_rollback_failed", extra={"tenant_id": str(user.id)})
        raise

    if not response.data:
        if applied_delta:
            try:
                _apply_stock_delta(supabase=supabase, tenant_id=user.id, delta=_invert_delta(applied_delta))
            except Exception:
                logger.exception("lead_create_stock_rollback_failed", extra={"tenant_id": str(user.id)})
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Erro ao criar lead.")

    return LeadResponse(**response.data[0])


@router.patch("/{lead_id}", response_model=LeadResponse)
async def update_lead(
    lead_id: str,
    payload: LeadUpdate,
    background_tasks: BackgroundTasks,
    user=Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_supabase),
):
    """Update a lead's data."""
    update_data = payload.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nenhum campo para atualizar.")

    rollback_needed = False
    applied_delta: dict[str, int] = {}

    if "products_json" in update_data:
        current_lead = (
            supabase.table("leads")
            .select("id, products_json, stock_reserved_json")
            .eq("id", lead_id)
            .eq("tenant_id", user.id)
            .single()
            .execute()
        )
        if not current_lead.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead não encontrado.")
        previous_reserved = current_lead.data.get("stock_reserved_json") or current_lead.data.get("products_json") or []
        next_reserved, applied_delta = _compute_stock_delta(previous_reserved, update_data.get("products_json") or [])
        _apply_stock_delta(supabase=supabase, tenant_id=user.id, delta=applied_delta)
        rollback_needed = True
        update_data["stock_reserved_json"] = next_reserved
        priced_value, resolved_lines = _price_lead_products_with_promotions(
            supabase=supabase,
            tenant_id=user.id,
            products_json=update_data.get("products_json") or [],
        )
        update_data["value"] = priced_value
        update_data["products_json"] = resolved_lines

    try:
        response = supabase.table("leads") \
            .update(update_data) \
            .eq("id", lead_id) \
            .eq("tenant_id", user.id) \
            .execute()
    except Exception:
        if rollback_needed and applied_delta:
            try:
                _apply_stock_delta(supabase=supabase, tenant_id=user.id, delta=_invert_delta(applied_delta))
            except Exception:
                logger.exception("lead_update_stock_rollback_failed", extra={"tenant_id": str(user.id), "lead_id": lead_id})
        raise

    if not response.data:
        if rollback_needed and applied_delta:
            try:
                _apply_stock_delta(supabase=supabase, tenant_id=user.id, delta=_invert_delta(applied_delta))
            except Exception:
                logger.exception("lead_update_stock_rollback_failed", extra={"tenant_id": str(user.id), "lead_id": lead_id})
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead não encontrado.")

    lead_data = response.data[0]

    # Sync with Uazapi if contact_name was updated and lead has whatsapp_chat_id
    if "contact_name" in update_data and lead_data.get("whatsapp_chat_id"):
        phone_number = lead_data["whatsapp_chat_id"].replace("@s.whatsapp.net", "").replace("@g.us", "")
        uazapi = get_uazapi_service()
        # Run in background to not block the request
        background_tasks.add_task(uazapi.update_contact, number=phone_number, name=lead_data["contact_name"])

    return LeadResponse(**lead_data)


@router.patch("/{lead_id}/stage", response_model=LeadResponse)
async def move_lead_stage(
    lead_id: str,
    payload: LeadMoveStage,
    user=Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_supabase),
):
    """Move a lead to a different Kanban column/stage."""
    # Canonicalize stage with tenant pipeline_stages to avoid case/label drift.
    stages = (
        supabase.table("pipeline_stages")
        .select("id, name")
        .eq("tenant_id", user.id)
        .execute()
    ).data or []

    canonical_stage = payload.stage
    if stages:
        if payload.stage_id:
            matched = next((s for s in stages if str(s.get("id")) == str(payload.stage_id)), None)
            if not matched:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Etapa inválida para este tenant.")
            canonical_stage = matched["name"]
        else:
            target = payload.stage.strip().lower()
            matched = next((s for s in stages if str(s.get("name", "")).strip().lower() == target), None)
            if not matched:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Etapa inválida para este tenant.")
            canonical_stage = matched["name"]

    response = supabase.table("leads") \
        .update({"stage": canonical_stage}) \
        .eq("id", lead_id) \
        .eq("tenant_id", user.id) \
        .execute()

    if not response.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead não encontrado.")

    return LeadResponse(**response.data[0])


@router.delete("/{lead_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_lead(
    lead_id: str,
    user=Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_supabase),
):
    """Delete a lead."""
    current = (
        supabase.table("leads")
        .select("id, products_json, stock_reserved_json")
        .eq("id", lead_id)
        .eq("tenant_id", user.id)
        .single()
        .execute()
    )
    if not current.data:
        return

    previous_reserved = current.data.get("stock_reserved_json") or current.data.get("products_json") or []
    _, release_delta = _compute_stock_delta(previous_reserved, [])
    if release_delta:
        _apply_stock_delta(supabase=supabase, tenant_id=user.id, delta=release_delta)
    supabase.table("leads").delete().eq("id", lead_id).eq("tenant_id", user.id).execute()


@router.get("/{lead_id}/messages")
async def get_lead_messages(
    lead_id: str,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user=Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_supabase),
):
    """
    Get the full chat message history for a lead (WhatsApp chat mirror).
    Returns messages sorted chronologically for display in the chat panel.
    """
    # First get the lead to find its whatsapp_chat_id
    lead_response = supabase.table("leads") \
        .select("id, company_name, contact_name, whatsapp_chat_id") \
        .eq("id", lead_id) \
        .eq("tenant_id", user.id) \
        .single() \
        .execute()

    if not lead_response.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead não encontrado.")

    lead = lead_response.data
    whatsapp_chat_id = lead.get("whatsapp_chat_id")

    if not whatsapp_chat_id:
        return {
            "lead_id": lead_id,
            "lead_name": f"{lead['contact_name']} - {lead['company_name']}",
            "whatsapp_chat_id": None,
            "messages": [],
            "total_messages": 0,
        }

    # Get messages for this chat, ordered chronologically
    messages_response = supabase.table("chat_messages") \
        .select("*", count="exact") \
        .eq("whatsapp_chat_id", whatsapp_chat_id) \
        .eq("tenant_id", user.id) \
        .order("created_at", desc=False) \
        .range(offset, offset + limit - 1) \
        .execute()

    return {
        "lead_id": lead_id,
        "lead_name": f"{lead['contact_name']} - {lead['company_name']}",
        "whatsapp_chat_id": whatsapp_chat_id,
        "messages": messages_response.data or [],
        "total_messages": messages_response.count or 0,
    }


@router.get("/{lead_id}/chat-history")
async def get_lead_chat_history(
    lead_id: str,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user=Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_supabase),
):
    """
    Get the full chat message history for a lead directly from Uazapi device.
    Returns messages fetched live from WhatsApp through the Uazapi integration.
    """
    lead_response = supabase.table("leads") \
        .select("id, company_name, contact_name, whatsapp_chat_id") \
        .eq("id", lead_id) \
        .eq("tenant_id", user.id) \
        .single() \
        .execute()

    if not lead_response.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead não encontrado.")

    lead = lead_response.data
    whatsapp_chat_id = lead.get("whatsapp_chat_id")

    if not whatsapp_chat_id:
        return {
            "lead_id": lead_id,
            "lead_name": f"{lead['contact_name']} - {lead['company_name']}",
            "whatsapp_chat_id": None,
            "messages": [],
            "hasMore": False,
        }

    # Fetch instance_token for tenant
    settings_response = supabase.table("settings") \
        .select("value") \
        .eq("key", "uazapi_instance_token") \
        .eq("tenant_id", user.id) \
        .limit(1) \
        .execute()
    
    instance_token = None
    if settings_response.data and len(settings_response.data) > 0:
        val = settings_response.data[0].get("value")
        if val:
            instance_token = val.strip('"') if isinstance(val, str) else str(val)

    # Fetch directly from Uazapi
    uazapi = get_uazapi_service()
    try:
        uazapi_response = await uazapi.find_messages(
            chatid=whatsapp_chat_id,
            limit=limit,
            offset=offset,
            instance_token=instance_token,
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Falha ao buscar histórico via Uazapi: {str(e)}",
        )

    return {
        "lead_id": lead_id,
        "lead_name": f"{lead['contact_name']} - {lead['company_name']}",
        "whatsapp_chat_id": whatsapp_chat_id,
        "messages": uazapi_response.get("messages", []),
        "returnedMessages": uazapi_response.get("returnedMessages", 0),
        "limit": uazapi_response.get("limit", limit),
        "offset": uazapi_response.get("offset", offset),
        "nextOffset": uazapi_response.get("nextOffset", None),
        "hasMore": uazapi_response.get("hasMore", False),
    }


@router.post("/{lead_id}/messages/send")
async def send_message_to_lead(
    lead_id: str,
    payload: SendMessagePayload,
    user=Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_supabase),
):
    """
    Send a WhatsApp message to a lead via Uazapi API.
    Supports text, image, video, document, and audio messages.
    The sent message is also saved in chat_messages for the chat mirror.
    """
    # Validate payload
    try:
        payload.validate_payload()
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    # Get the lead's WhatsApp chat ID
    lead_response = supabase.table("leads") \
        .select("id, company_name, contact_name, whatsapp_chat_id, tenant_id") \
        .eq("id", lead_id) \
        .eq("tenant_id", user.id) \
        .single() \
        .execute()

    if not lead_response.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead não encontrado.")

    lead = lead_response.data
    whatsapp_chat_id = lead.get("whatsapp_chat_id")

    if not whatsapp_chat_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Este lead não possui WhatsApp vinculado (whatsapp_chat_id).",
        )

    # Fetch instance_token for tenant
    settings_response = supabase.table("settings") \
        .select("value") \
        .eq("key", "uazapi_instance_token") \
        .eq("tenant_id", user.id) \
        .limit(1) \
        .execute()
    
    instance_token = None
    if settings_response.data and len(settings_response.data) > 0:
        val = settings_response.data[0].get("value")
        if val:
            instance_token = val.strip('"') if isinstance(val, str) else str(val)

    # Extract the phone number from the JID
    phone_number = whatsapp_chat_id.replace("@s.whatsapp.net", "").replace("@g.us", "")

    # Send the message via Uazapi
    uazapi = get_uazapi_service()
    uazapi_response = None

    try:
        if payload.file_url and payload.media_type:
            # Send media (optionally with caption/text)
            uazapi_response = await uazapi.send_media(
                number=phone_number,
                media_type=payload.media_type,
                file_url=payload.file_url,
                caption=payload.text or "",
                doc_name=payload.file_name,
                instance_token=instance_token,
            )
        else:
            # Send text only
            uazapi_response = await uazapi.send_text(
                number=phone_number,
                text=payload.text,
                instance_token=instance_token,
            )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Falha ao enviar mensagem via Uazapi: {str(e)}",
        )

    # Determine content type and text for saving
    content_type = payload.media_type or "text"
    content_text = payload.text or f"[{content_type.upper()}]"
    caption = payload.text if payload.file_url else None

    # Save the outgoing message to chat_messages
    message_record = {
        "whatsapp_chat_id": whatsapp_chat_id,
        "whatsapp_message_id": uazapi_response.get("messageid", "") if uazapi_response else "",
        "lead_id": lead_id,
        "tenant_id": lead.get("tenant_id"),
        "direction": "outgoing",
        "content_type": content_type,
        "content": content_text,
        "media_url": payload.file_url,
        "media_mimetype": None,
        "media_filename": payload.file_name,
        "caption": caption,
        "sender_name": "CRM Neurix",
        "sender_phone": "",
    }
    # Remove None values
    message_record = {k: v for k, v in message_record.items() if v is not None}

    try:
        saved = supabase.table("chat_messages").insert(message_record).execute()
    except Exception as e:
        # Message was sent but failed to save — log but don't error
        print(f"⚠️ Message sent but failed to save: {e}")
        saved = None

    return {
        "status": "sent",
        "message": "Mensagem enviada com sucesso.",
        "uazapi_response": uazapi_response,
        "saved_message": saved.data[0] if saved and saved.data else message_record,
    }
