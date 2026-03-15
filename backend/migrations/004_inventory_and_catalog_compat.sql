-- 004_inventory_and_catalog_compat.sql
-- Compatibility for catalog + inventory reservation model

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- PRODUCTS: stock quantity for real inventory control
-- ============================================================
ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS stock_quantity INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'ck_products_stock_quantity_non_negative'
    ) THEN
        ALTER TABLE public.products
            ADD CONSTRAINT ck_products_stock_quantity_non_negative CHECK (stock_quantity >= 0);
    END IF;
END $$;

-- ============================================================
-- LEADS: reservation and purchase history
-- ============================================================
ALTER TABLE public.leads
    ADD COLUMN IF NOT EXISTS stock_reserved_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS purchase_history_json JSONB NOT NULL DEFAULT '[]'::jsonb;

-- ============================================================
-- PROMOTIONS: legacy compatibility and required fields
-- ============================================================
ALTER TABLE public.promotions
    ADD COLUMN IF NOT EXISTS slug TEXT,
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS discount_type TEXT,
    ADD COLUMN IF NOT EXISTS discount_value NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS category_id UUID NULL REFERENCES public.product_categories(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS value NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE public.promotions
SET slug = COALESCE(slug, lower(regexp_replace(trim(name), '[^a-zA-Z0-9]+', '-', 'g')))
WHERE slug IS NULL OR trim(slug) = '';

UPDATE public.promotions
SET discount_type = COALESCE(discount_type, 'percent')
WHERE discount_type IS NULL;

UPDATE public.promotions
SET discount_value = COALESCE(discount_value, 0)
WHERE discount_value IS NULL;

UPDATE public.promotions
SET value = COALESCE(value, discount_value, 0)
WHERE value IS NULL;

UPDATE public.promotions
SET starts_at = COALESCE(starts_at, now())
WHERE starts_at IS NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_promotions_tenant_slug'
    ) THEN
        ALTER TABLE public.promotions
            ADD CONSTRAINT uq_promotions_tenant_slug UNIQUE (tenant_id, slug);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ck_promotions_discount_type'
    ) THEN
        ALTER TABLE public.promotions
            ADD CONSTRAINT ck_promotions_discount_type CHECK (discount_type IN ('percent', 'fixed'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ck_promotions_period'
    ) THEN
        ALTER TABLE public.promotions
            ADD CONSTRAINT ck_promotions_period CHECK (ends_at IS NULL OR ends_at >= starts_at);
    END IF;
END $$;

-- Make sure promotion_products table exists
CREATE TABLE IF NOT EXISTS public.promotion_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    promotion_id UUID NOT NULL REFERENCES public.promotions(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_promotion_products_tenant_pair UNIQUE (tenant_id, promotion_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_products_tenant_stock
    ON public.products(tenant_id, stock_quantity);

CREATE INDEX IF NOT EXISTS idx_leads_tenant_reserved
    ON public.leads(tenant_id);

-- Refresh PostgREST schema cache (Supabase API)
NOTIFY pgrst, 'reload schema';

COMMIT;
