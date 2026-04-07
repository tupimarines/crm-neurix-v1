"""
Clientes CRM (`crm_clients`) — CRUD com validação de CPF/CNPJ (Sprint 10).

Escopo de tenant:
- **Superadmin**: obrigatório `tenant_id` em query/body onde indicado.
- **Admin de org**: próprio `user.id` ou outro tenant que seja admin na mesma organização.
- **Read-only**: apenas leitura (`GET`) no próprio tenant; sem mutações.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from supabase import Client as SupabaseClient

from app.authz import EffectiveRole, get_effective_role
from app.dependencies import get_current_user, get_supabase
from app.models.client import CrmClientCreate, CrmClientResponse, CrmClientUpdate, crm_client_from_row
from app.org_scope import admin_user_ids_for_organization
from app.services.phone_normalize import digits_only
from app.services.lead_phone_sync import sync_all_leads_phone_for_client

router = APIRouter()


def _resolve_list_tenant(
    supabase: SupabaseClient,
    eff: EffectiveRole,
    uid: str,
    tenant_id: Optional[str],
) -> str:
    tid = (tenant_id or "").strip()
    if eff.is_superadmin:
        if not tid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Parâmetro tenant_id é obrigatório para superadmin.",
            )
        return tid
    if eff.is_read_only:
        return uid
    if not tid or tid == uid:
        return uid
    if eff.is_org_admin and eff.org_member_organization_id:
        allowed = admin_user_ids_for_organization(supabase, eff.org_member_organization_id)
        if tid in allowed:
            return tid
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sem permissão para listar este tenant.")


def _resolve_write_tenant_for_create(
    supabase: SupabaseClient,
    eff: EffectiveRole,
    uid: str,
    body_tenant_id: Optional[str],
) -> str:
    if eff.is_superadmin:
        t = (body_tenant_id or "").strip()
        if not t:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Campo tenant_id é obrigatório para superadmin.",
            )
        return t
    if eff.is_read_only:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Somente leitura não pode criar clientes.",
        )
    raw = (body_tenant_id or "").strip()
    if not raw or raw == uid:
        return uid
    if eff.is_org_admin and eff.org_member_organization_id:
        allowed = admin_user_ids_for_organization(supabase, eff.org_member_organization_id)
        if raw in allowed:
            return raw
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sem permissão para criar neste tenant.")


def _assert_can_mutate(
    supabase: SupabaseClient,
    eff: EffectiveRole,
    uid: str,
    row_tenant_id: str,
) -> None:
    if eff.is_read_only:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Somente leitura não pode alterar clientes.",
        )
    tid = str(row_tenant_id)
    if eff.is_superadmin:
        return
    if tid == uid:
        return
    if eff.is_org_admin and eff.org_member_organization_id:
        allowed = admin_user_ids_for_organization(supabase, eff.org_member_organization_id)
        if tid in allowed:
            return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sem permissão para alterar este cliente.")


def _get_client_row(supabase: SupabaseClient, client_id: str) -> dict[str, Any]:
    res = supabase.table("crm_clients").select("*").eq("id", client_id).limit(1).execute()
    rows = res.data or []
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cliente não encontrado.")
    return rows[0]


def _assert_can_read_row(
    supabase: SupabaseClient,
    eff: EffectiveRole,
    uid: str,
    row: dict[str, Any],
) -> None:
    tid = str(row["tenant_id"])
    if eff.is_superadmin:
        return
    if tid == uid:
        return
    if eff.is_org_admin and eff.org_member_organization_id:
        allowed = admin_user_ids_for_organization(supabase, eff.org_member_organization_id)
        if tid in allowed:
            return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sem permissão para ver este cliente.")


@router.get("/", response_model=list[CrmClientResponse])
async def list_clients(
    tenant_id: Optional[str] = Query(None, description="Obrigatório para superadmin (UUID do tenant)."),
    user=Depends(get_current_user),
    eff: EffectiveRole = Depends(get_effective_role),
    supabase: SupabaseClient = Depends(get_supabase),
):
    uid = str(user.id)
    target = _resolve_list_tenant(supabase, eff, uid, tenant_id)
    res = (
        supabase.table("crm_clients")
        .select("*")
        .eq("tenant_id", target)
        .order("created_at", desc=True)
        .execute()
    )
    return [crm_client_from_row(r) for r in (res.data or [])]


@router.get("/lookup/by-phone", response_model=Optional[CrmClientResponse])
async def lookup_client_by_phone(
    phone: str = Query(..., min_length=4, description="Telefone (apenas dígitos ou formatado)."),
    tenant_id: Optional[str] = Query(None),
    user=Depends(get_current_user),
    eff: EffectiveRole = Depends(get_effective_role),
    supabase: SupabaseClient = Depends(get_supabase),
):
    """Resolve cliente por telefone normalizado. Retorna o primeiro match ou null."""
    uid = str(user.id)
    target = _resolve_list_tenant(supabase, eff, uid, tenant_id)
    needle = digits_only(phone)
    if len(needle) < 4:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Telefone muito curto.")

    res = (
        supabase.table("crm_clients")
        .select("*")
        .eq("tenant_id", target)
        .order("created_at", desc=True)
        .execute()
    )
    for r in res.data or []:
        phones_raw = r.get("phones")
        if not isinstance(phones_raw, list):
            continue
        for p in phones_raw:
            if digits_only(str(p)) == needle:
                return crm_client_from_row(r)
    return None


@router.get("/{client_id}", response_model=CrmClientResponse)
async def get_client(
    client_id: str,
    user=Depends(get_current_user),
    eff: EffectiveRole = Depends(get_effective_role),
    supabase: SupabaseClient = Depends(get_supabase),
):
    uid = str(user.id)
    row = _get_client_row(supabase, client_id)
    _assert_can_read_row(supabase, eff, uid, row)
    return crm_client_from_row(row)


@router.post("/", response_model=CrmClientResponse, status_code=status.HTTP_201_CREATED)
async def create_client(
    payload: CrmClientCreate,
    user=Depends(get_current_user),
    eff: EffectiveRole = Depends(get_effective_role),
    supabase: SupabaseClient = Depends(get_supabase),
):
    uid = str(user.id)
    target_tid = _resolve_write_tenant_for_create(supabase, eff, uid, payload.tenant_id)

    now = datetime.now(timezone.utc).isoformat()
    insert_body: dict[str, Any] = {
        "tenant_id": target_tid,
        "person_type": payload.person_type,
        "cpf": payload.cpf,
        "cnpj": payload.cnpj,
        "display_name": payload.display_name.strip(),
        "contact_name": payload.contact_name.strip() if payload.contact_name else None,
        "phones": payload.phones,
        "address_line1": payload.address_line1,
        "address_line2": payload.address_line2,
        "neighborhood": payload.neighborhood,
        "postal_code": payload.postal_code,
        "city": payload.city,
        "state": payload.state,
        "complement": payload.complement,
        "no_number": payload.no_number if payload.no_number is not None else False,
        "dead_end_street": payload.dead_end_street if payload.dead_end_street is not None else False,
        "updated_at": now,
    }
    ins = supabase.table("crm_clients").insert(insert_body).execute()
    rows = ins.data or []
    if not rows:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Falha ao criar cliente.")
    return crm_client_from_row(rows[0])


@router.patch("/{client_id}", response_model=CrmClientResponse)
async def update_client(
    client_id: str,
    payload: CrmClientUpdate,
    user=Depends(get_current_user),
    eff: EffectiveRole = Depends(get_effective_role),
    supabase: SupabaseClient = Depends(get_supabase),
):
    uid = str(user.id)
    row = _get_client_row(supabase, client_id)
    _assert_can_mutate(supabase, eff, uid, str(row["tenant_id"]))

    data = payload.model_dump(exclude_unset=True)
    if not data:
        return crm_client_from_row(row)

    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    upd = supabase.table("crm_clients").update(data).eq("id", client_id).execute()
    rows = upd.data or []
    if not rows:
        row2 = _get_client_row(supabase, client_id)
        return crm_client_from_row(row2)
    out = rows[0]
    if "phones" in data:
        sync_all_leads_phone_for_client(
            supabase, tenant_id=str(out["tenant_id"]), client_id=client_id
        )
    return crm_client_from_row(out)


@router.delete("/{client_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_client(
    client_id: str,
    user=Depends(get_current_user),
    eff: EffectiveRole = Depends(get_effective_role),
    supabase: SupabaseClient = Depends(get_supabase),
):
    uid = str(user.id)
    row = _get_client_row(supabase, client_id)
    _assert_can_mutate(supabase, eff, uid, str(row["tenant_id"]))
    supabase.table("crm_clients").delete().eq("id", client_id).execute()
    return None


@router.get("/{client_id}/leads")
async def list_client_leads(
    client_id: str,
    user=Depends(get_current_user),
    eff: EffectiveRole = Depends(get_effective_role),
    supabase: SupabaseClient = Depends(get_supabase),
):
    """Lista leads/cards de negócio vinculados ao cliente."""
    uid = str(user.id)
    row = _get_client_row(supabase, client_id)
    _assert_can_read_row(supabase, eff, uid, row)
    res = (
        supabase.table("leads")
        .select("id, contact_name, company_name, phone, stage, value, created_at, updated_at, products_json, purchase_history_json")
        .eq("client_id", client_id)
        .order("created_at", desc=True)
        .execute()
    )
    return res.data or []


@router.get("/{client_id}/orders")
async def list_client_orders(
    client_id: str,
    user=Depends(get_current_user),
    eff: EffectiveRole = Depends(get_effective_role),
    supabase: SupabaseClient = Depends(get_supabase),
):
    """Lista pedidos de leads vinculados ao cliente (histórico de compras)."""
    uid = str(user.id)
    row = _get_client_row(supabase, client_id)
    _assert_can_read_row(supabase, eff, uid, row)
    leads_res = (
        supabase.table("leads")
        .select("id")
        .eq("client_id", client_id)
        .execute()
    )
    lead_ids = [str(l["id"]) for l in (leads_res.data or [])]
    if not lead_ids:
        return []
    orders_res = (
        supabase.table("orders")
        .select("id, lead_id, client_name, product_summary, products_json, total, payment_status, created_at")
        .in_("lead_id", lead_ids)
        .order("created_at", desc=True)
        .execute()
    )
    return orders_res.data or []
