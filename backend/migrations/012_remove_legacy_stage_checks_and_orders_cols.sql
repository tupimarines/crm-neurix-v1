-- Migration 012: Remove legacy stage CHECK constraints + add missing columns to orders
-- Sprint 1 — automação de funil
-- Idempotent: safe to re-run if constraints were already dropped manually in Supabase.

-- 1. Drop ALL CHECK constraints on leads.stage and keyword_rules.target_stage.
--    The constraint names may vary between environments (e.g. leads_stage_check,
--    leads_stage_check1, auto-generated names). This DO block discovers and drops
--    any CHECK constraint whose expression references the column.
DO $$
DECLARE
    _con record;
BEGIN
    -- leads.stage CHECK constraints
    FOR _con IN
        SELECT con.conname
        FROM pg_constraint con
        JOIN pg_attribute att ON att.attnum = ANY(con.conkey)
            AND att.attrelid = con.conrelid
        WHERE con.conrelid = 'public.leads'::regclass
          AND con.contype = 'c'
          AND att.attname = 'stage'
    LOOP
        EXECUTE format('ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS %I', _con.conname);
    END LOOP;

    -- keyword_rules.target_stage CHECK constraints
    FOR _con IN
        SELECT con.conname
        FROM pg_constraint con
        JOIN pg_attribute att ON att.attnum = ANY(con.conkey)
            AND att.attrelid = con.conrelid
        WHERE con.conrelid = 'public.keyword_rules'::regclass
          AND con.contype = 'c'
          AND att.attname = 'target_stage'
    LOOP
        EXECUTE format('ALTER TABLE public.keyword_rules DROP CONSTRAINT IF EXISTS %I', _con.conname);
    END LOOP;
END $$;

-- 2. Deactivate legacy keyword rules that reference the old stage slugs.
--    Keeps the rows for audit; prevents the keyword engine from using stale stages.
UPDATE public.keyword_rules
SET is_active = false
WHERE target_stage IN ('contato_inicial', 'escolhendo_sabores', 'aguardando_pagamento', 'enviado')
  AND is_active = true;

-- 3. Add columns needed for n8n order integration (idempotent).
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_method TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.crm_clients(id) ON DELETE SET NULL;

-- 4. Index for client-based order lookups.
CREATE INDEX IF NOT EXISTS idx_orders_client ON public.orders(client_id);

-- Validation query (run manually after migration):
-- SELECT conname FROM pg_constraint WHERE conrelid = 'public.leads'::regclass AND contype = 'c';
-- Expected: no rows with 'leads_stage_check'
