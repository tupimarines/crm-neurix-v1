"""
Orders Router — CRUD for orders.
Maps to the Dashboard orders table.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from supabase import Client as SupabaseClient
from typing import Optional

from app.dependencies import get_supabase, get_current_user
from app.models.order import OrderCreate, OrderUpdate, OrderResponse, PaymentStatus

router = APIRouter()


@router.get("/", response_model=list[OrderResponse])
async def list_orders(
    payment_status: Optional[PaymentStatus] = None,
    limit: int = Query(20, ge=1, le=100),
    user=Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_supabase),
):
    """List orders with optional payment status filter."""
    query = supabase.table("orders").select("*").order("created_at", desc=True).limit(limit)

    if payment_status:
        query = query.eq("payment_status", payment_status.value)

    response = query.execute()
    return [OrderResponse(**row) for row in response.data]


@router.post("/", response_model=OrderResponse, status_code=status.HTTP_201_CREATED)
async def create_order(
    payload: OrderCreate,
    user=Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_supabase),
):
    """Create a new order."""
    data = payload.model_dump()
    data["tenant_id"] = user.id

    response = supabase.table("orders").insert(data).execute()

    if not response.data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Erro ao criar pedido.")

    return OrderResponse(**response.data[0])


@router.patch("/{order_id}", response_model=OrderResponse)
async def update_order(
    order_id: str,
    payload: OrderUpdate,
    user=Depends(get_current_user),
    supabase: SupabaseClient = Depends(get_supabase),
):
    """Update an order (e.g., change payment status)."""
    update_data = payload.model_dump(exclude_unset=True)

    response = supabase.table("orders") \
        .update(update_data) \
        .eq("id", order_id) \
        .execute()

    if not response.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pedido não encontrado.")

    return OrderResponse(**response.data[0])
