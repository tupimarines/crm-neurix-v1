-- Pedidos arquivados (histórico) — usado por POST /api/orders/{id}/archive
-- Executar no Supabase SQL Editor após revisar (staging primeiro).

CREATE TABLE IF NOT EXISTS public.orders_archived (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    original_order_id UUID NOT NULL,
    tenant_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
    client_name TEXT NOT NULL,
    total NUMERIC(12,2) NOT NULL DEFAULT 0,
    payment_status TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_archived_tenant ON public.orders_archived(tenant_id);
CREATE INDEX IF NOT EXISTS idx_orders_archived_original ON public.orders_archived(original_order_id);
