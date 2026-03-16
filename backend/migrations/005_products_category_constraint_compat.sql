-- 005_products_category_constraint_compat.sql
-- Harden products category compatibility for legacy + dynamic catalog schemas

BEGIN;

-- Normalize legacy category values that can break strict CHECK constraints.
UPDATE public.products
SET category = NULL
WHERE category IS NOT NULL
  AND btrim(category) = '';

-- If category_id exists, allow dynamic categories without breaking old enum check.
DO $$
DECLARE
    has_category_id BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'products'
          AND column_name = 'category_id'
    ) INTO has_category_id;

    IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'products_category_check'
          AND conrelid = 'public.products'::regclass
    ) THEN
        ALTER TABLE public.products DROP CONSTRAINT products_category_check;
    END IF;

    IF has_category_id THEN
        ALTER TABLE public.products
            ADD CONSTRAINT products_category_check
            CHECK (
                category IS NULL
                OR category IN ('tradicional', 'diet_zero', 'gourmet', 'sazonal')
                OR category_id IS NOT NULL
            );
    ELSE
        ALTER TABLE public.products
            ADD CONSTRAINT products_category_check
            CHECK (
                category IS NULL
                OR category IN ('tradicional', 'diet_zero', 'gourmet', 'sazonal')
            );
    END IF;
END $$;

-- Refresh PostgREST schema cache in Supabase.
NOTIFY pgrst, 'reload schema';

COMMIT;
