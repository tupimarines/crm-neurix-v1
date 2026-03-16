-- 005_pipeline_stage_conversion_flag.sql
-- Add explicit conversion marker to pipeline stages.

BEGIN;

ALTER TABLE public.pipeline_stages
    ADD COLUMN IF NOT EXISTS is_conversion BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_pipeline_stages_tenant_conversion
    ON public.pipeline_stages(tenant_id, is_conversion);

-- Refresh PostgREST schema cache (Supabase API)
NOTIFY pgrst, 'reload schema';

COMMIT;
