-- Sprint 11 — Automação por etapa + backfill lead_pipeline_positions
-- Executar no Supabase SQL Editor após revisar (staging primeiro).

BEGIN;

-- =============================================================================
-- stage_automations: uma regra por etapa de origem (UNIQUE source_stage_id)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.stage_automations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    source_funnel_id UUID NOT NULL REFERENCES public.funnels(id) ON DELETE CASCADE,
    source_stage_id UUID NOT NULL REFERENCES public.pipeline_stages(id) ON DELETE CASCADE,
    target_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    target_funnel_id UUID NOT NULL REFERENCES public.funnels(id) ON DELETE CASCADE,
    target_stage_id UUID NOT NULL REFERENCES public.pipeline_stages(id) ON DELETE CASCADE,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT stage_automations_one_per_source_stage UNIQUE (source_stage_id)
);

CREATE INDEX IF NOT EXISTS idx_stage_automations_org ON public.stage_automations(organization_id);
CREATE INDEX IF NOT EXISTS idx_stage_automations_source_funnel ON public.stage_automations(source_funnel_id);

ALTER TABLE public.stage_automations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stage_automations_select ON public.stage_automations;
CREATE POLICY stage_automations_select ON public.stage_automations
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.organization_members om
            WHERE om.organization_id = stage_automations.organization_id
              AND om.user_id = auth.uid()
        )
    );

DROP TRIGGER IF EXISTS stage_automations_updated_at ON public.stage_automations;
CREATE TRIGGER stage_automations_updated_at
    BEFORE UPDATE ON public.stage_automations
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- =============================================================================
-- Backfill: posição primária no board do dono do lead (tenant = board_owner)
-- =============================================================================
INSERT INTO public.lead_pipeline_positions (lead_id, funnel_id, stage_id, board_owner_user_id, sort_order)
SELECT l.id, l.funnel_id, ps.id, l.tenant_id, 0
FROM public.leads l
JOIN public.pipeline_stages ps
  ON ps.tenant_id = l.tenant_id
 AND ps.funnel_id = l.funnel_id
 AND lower(trim(ps.name)) = lower(trim(l.stage))
WHERE l.funnel_id IS NOT NULL
ON CONFLICT (lead_id, funnel_id, board_owner_user_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';

COMMIT;
