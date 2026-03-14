-- 003_catalog_promotions_and_stage_reorder.sql
-- Kanban reorder + catalogo comercial (categorias dinamicas + promocoes)

BEGIN;

-- ============================================================
-- 1) EXTENSOES DE SCHEMA EXISTENTE
-- ============================================================

ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS category_id UUID NULL;

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS products_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS stage TEXT,
    ADD COLUMN IF NOT EXISTS notes TEXT,
    ADD COLUMN IF NOT EXISTS applied_promotions_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS discount_total NUMERIC(12,2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.pipeline_stages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT,
    order_position INTEGER NOT NULL DEFAULT 0,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.pipeline_stages
    ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_pipeline_stages_tenant_order
    ON public.pipeline_stages(tenant_id, order_position);

-- ============================================================
-- 2) NOVO CATALOGO DINAMICO
-- ============================================================

CREATE TABLE IF NOT EXISTS public.product_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_product_categories_tenant_slug UNIQUE (tenant_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_product_categories_tenant_active_name
    ON public.product_categories(tenant_id, is_active, name);

ALTER TABLE public.products
    ADD CONSTRAINT fk_products_category_id
    FOREIGN KEY (category_id) REFERENCES public.product_categories(id)
    ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.promotions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    description TEXT,
    discount_type TEXT NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
    discount_value NUMERIC(12,2) NOT NULL CHECK (discount_value >= 0),
    category_id UUID NULL REFERENCES public.product_categories(id) ON DELETE SET NULL,
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NULL,
    priority INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_promotions_tenant_slug UNIQUE (tenant_id, slug),
    CONSTRAINT ck_promotions_period CHECK (ends_at IS NULL OR ends_at >= starts_at)
);

CREATE INDEX IF NOT EXISTS idx_promotions_tenant_active_period
    ON public.promotions(tenant_id, is_active, starts_at, ends_at, priority DESC);

CREATE INDEX IF NOT EXISTS idx_promotions_tenant_category
    ON public.promotions(tenant_id, category_id);

CREATE TABLE IF NOT EXISTS public.promotion_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    promotion_id UUID NOT NULL REFERENCES public.promotions(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_promotion_products_tenant_pair UNIQUE (tenant_id, promotion_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_promotion_products_tenant_product
    ON public.promotion_products(tenant_id, product_id);

CREATE INDEX IF NOT EXISTS idx_promotion_products_tenant_promotion
    ON public.promotion_products(tenant_id, promotion_id);

-- ============================================================
-- 3) RLS + POLICIES
-- ============================================================

ALTER TABLE public.pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pipeline_stages_select ON public.pipeline_stages;
DROP POLICY IF EXISTS pipeline_stages_insert ON public.pipeline_stages;
DROP POLICY IF EXISTS pipeline_stages_update ON public.pipeline_stages;
DROP POLICY IF EXISTS pipeline_stages_delete ON public.pipeline_stages;
CREATE POLICY pipeline_stages_select ON public.pipeline_stages FOR SELECT USING (auth.uid() = tenant_id);
CREATE POLICY pipeline_stages_insert ON public.pipeline_stages FOR INSERT WITH CHECK (auth.uid() = tenant_id);
CREATE POLICY pipeline_stages_update ON public.pipeline_stages FOR UPDATE USING (auth.uid() = tenant_id);
CREATE POLICY pipeline_stages_delete ON public.pipeline_stages FOR DELETE USING (auth.uid() = tenant_id);

DROP POLICY IF EXISTS product_categories_select ON public.product_categories;
DROP POLICY IF EXISTS product_categories_insert ON public.product_categories;
DROP POLICY IF EXISTS product_categories_update ON public.product_categories;
DROP POLICY IF EXISTS product_categories_delete ON public.product_categories;
CREATE POLICY product_categories_select ON public.product_categories FOR SELECT USING (auth.uid() = tenant_id);
CREATE POLICY product_categories_insert ON public.product_categories FOR INSERT WITH CHECK (auth.uid() = tenant_id);
CREATE POLICY product_categories_update ON public.product_categories FOR UPDATE USING (auth.uid() = tenant_id);
CREATE POLICY product_categories_delete ON public.product_categories FOR DELETE USING (auth.uid() = tenant_id);

DROP POLICY IF EXISTS promotions_select ON public.promotions;
DROP POLICY IF EXISTS promotions_insert ON public.promotions;
DROP POLICY IF EXISTS promotions_update ON public.promotions;
DROP POLICY IF EXISTS promotions_delete ON public.promotions;
CREATE POLICY promotions_select ON public.promotions FOR SELECT USING (auth.uid() = tenant_id);
CREATE POLICY promotions_insert ON public.promotions FOR INSERT WITH CHECK (auth.uid() = tenant_id);
CREATE POLICY promotions_update ON public.promotions FOR UPDATE USING (auth.uid() = tenant_id);
CREATE POLICY promotions_delete ON public.promotions FOR DELETE USING (auth.uid() = tenant_id);

DROP POLICY IF EXISTS promotion_products_select ON public.promotion_products;
DROP POLICY IF EXISTS promotion_products_insert ON public.promotion_products;
DROP POLICY IF EXISTS promotion_products_update ON public.promotion_products;
DROP POLICY IF EXISTS promotion_products_delete ON public.promotion_products;
CREATE POLICY promotion_products_select ON public.promotion_products FOR SELECT USING (auth.uid() = tenant_id);
CREATE POLICY promotion_products_insert ON public.promotion_products FOR INSERT WITH CHECK (auth.uid() = tenant_id);
CREATE POLICY promotion_products_update ON public.promotion_products FOR UPDATE USING (auth.uid() = tenant_id);
CREATE POLICY promotion_products_delete ON public.promotion_products FOR DELETE USING (auth.uid() = tenant_id);

-- ============================================================
-- 4) TRIGGERS updated_at
-- ============================================================

DROP TRIGGER IF EXISTS pipeline_stages_updated_at ON public.pipeline_stages;
CREATE TRIGGER pipeline_stages_updated_at BEFORE UPDATE ON public.pipeline_stages
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS product_categories_updated_at ON public.product_categories;
CREATE TRIGGER product_categories_updated_at BEFORE UPDATE ON public.product_categories
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS promotions_updated_at ON public.promotions;
CREATE TRIGGER promotions_updated_at BEFORE UPDATE ON public.promotions
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

COMMIT;
