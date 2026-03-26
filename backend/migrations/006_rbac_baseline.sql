-- 006_rbac_baseline.sql
-- Sprint 1 — Schema baseline: organizations, funnels, inboxes, CRM clients,
-- lead_activity, lead_pipeline_positions, colunas em profiles/leads/pipeline_stages.
-- Executar no Supabase SQL Editor (staging primeiro). Idempotente via IF NOT EXISTS.

BEGIN;

-- =============================================================================
-- ORGANIZAÇÕES E MEMBROS
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.organization_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('admin', 'read_only')),
    assigned_funnel_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_members_user ON public.organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org ON public.organization_members(organization_id);

-- =============================================================================
-- PERFIS: superadmin + vínculo opcional à org
-- =============================================================================
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS is_superadmin BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_organization ON public.profiles(organization_id);

-- =============================================================================
-- FUNIS
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.funnels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_funnels_tenant ON public.funnels(tenant_id);

-- FK read_only → funil (CHECK role/read_only em sprint posterior)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'organization_members_assigned_funnel_id_fkey'
    ) THEN
        ALTER TABLE public.organization_members
            ADD CONSTRAINT organization_members_assigned_funnel_id_fkey
            FOREIGN KEY (assigned_funnel_id) REFERENCES public.funnels(id) ON DELETE SET NULL;
    END IF;
END $$;

-- =============================================================================
-- CAIXAS DE ENTRADA (1 funil por caixa; N caixas por funil)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.inboxes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    funnel_id UUID NOT NULL REFERENCES public.funnels(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    uazapi_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inboxes_funnel ON public.inboxes(funnel_id);
CREATE INDEX IF NOT EXISTS idx_inboxes_tenant ON public.inboxes(tenant_id);

-- =============================================================================
-- LEADS / ETAPAS: origem inbox + funil (backfill NOT NULL em sprint dedicado)
-- =============================================================================
ALTER TABLE public.leads
    ADD COLUMN IF NOT EXISTS inbox_id UUID REFERENCES public.inboxes(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS funnel_id UUID REFERENCES public.funnels(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_inbox ON public.leads(inbox_id);
CREATE INDEX IF NOT EXISTS idx_leads_funnel ON public.leads(funnel_id);

ALTER TABLE public.pipeline_stages
    ADD COLUMN IF NOT EXISTS funnel_id UUID REFERENCES public.funnels(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_pipeline_stages_funnel ON public.pipeline_stages(funnel_id);

-- =============================================================================
-- AUDITORIA DE MOVIMENTAÇÃO
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.lead_activity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    from_stage_id UUID REFERENCES public.pipeline_stages(id) ON DELETE SET NULL,
    to_stage_id UUID REFERENCES public.pipeline_stages(id) ON DELETE SET NULL,
    actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_lead_activity_lead ON public.lead_activity(lead_id, occurred_at DESC);

-- =============================================================================
-- CLIENTES CRM
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.crm_clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    person_type TEXT NOT NULL CHECK (person_type IN ('PF', 'PJ')),
    cpf TEXT,
    cnpj TEXT,
    display_name TEXT NOT NULL,
    contact_name TEXT,
    phones JSONB NOT NULL DEFAULT '[]'::jsonb,
    address_line1 TEXT,
    address_line2 TEXT,
    neighborhood TEXT,
    postal_code TEXT,
    city TEXT,
    state TEXT,
    complement TEXT,
    no_number BOOLEAN DEFAULT false,
    dead_end_street BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_clients_tenant ON public.crm_clients(tenant_id);

ALTER TABLE public.leads
    ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.crm_clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_client ON public.leads(client_id);

-- =============================================================================
-- POSICIONAMENTO MULTI-FUNIL (ADR-001)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.lead_pipeline_positions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    funnel_id UUID NOT NULL REFERENCES public.funnels(id) ON DELETE CASCADE,
    stage_id UUID NOT NULL REFERENCES public.pipeline_stages(id) ON DELETE CASCADE,
    board_owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    UNIQUE (lead_id, funnel_id, board_owner_user_id)
);

CREATE INDEX IF NOT EXISTS idx_lead_pipeline_positions_funnel ON public.lead_pipeline_positions(funnel_id);
CREATE INDEX IF NOT EXISTS idx_lead_pipeline_positions_board ON public.lead_pipeline_positions(board_owner_user_id);

-- =============================================================================
-- Triggers updated_at (função já existe em 001)
-- =============================================================================
DROP TRIGGER IF EXISTS organizations_updated_at ON public.organizations;
CREATE TRIGGER organizations_updated_at
    BEFORE UPDATE ON public.organizations
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS funnels_updated_at ON public.funnels;
CREATE TRIGGER funnels_updated_at
    BEFORE UPDATE ON public.funnels
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS inboxes_updated_at ON public.inboxes;
CREATE TRIGGER inboxes_updated_at
    BEFORE UPDATE ON public.inboxes
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS crm_clients_updated_at ON public.crm_clients;
CREATE TRIGGER crm_clients_updated_at
    BEFORE UPDATE ON public.crm_clients
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- =============================================================================
-- RLS (alinhado a leads/products: tenant_id = auth.uid() onde aplicável)
-- =============================================================================
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funnels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inboxes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_pipeline_positions ENABLE ROW LEVEL SECURITY;

-- Membros: usuário vê a própria linha
DROP POLICY IF EXISTS organization_members_select_own ON public.organization_members;
CREATE POLICY organization_members_select_own ON public.organization_members
    FOR SELECT USING (auth.uid() = user_id);

-- Organizações: apenas onde o usuário é membro (gestão via API em sprint posterior)
DROP POLICY IF EXISTS organizations_select_member ON public.organizations;
CREATE POLICY organizations_select_member ON public.organizations
    FOR SELECT USING (
        id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid())
    );

-- Funis / inboxes / clientes: isolamento por tenant (legado tenant_id = user)
DROP POLICY IF EXISTS funnels_select ON public.funnels;
DROP POLICY IF EXISTS funnels_insert ON public.funnels;
DROP POLICY IF EXISTS funnels_update ON public.funnels;
DROP POLICY IF EXISTS funnels_delete ON public.funnels;
CREATE POLICY funnels_select ON public.funnels FOR SELECT USING (auth.uid() = tenant_id);
CREATE POLICY funnels_insert ON public.funnels FOR INSERT WITH CHECK (auth.uid() = tenant_id);
CREATE POLICY funnels_update ON public.funnels FOR UPDATE USING (auth.uid() = tenant_id);
CREATE POLICY funnels_delete ON public.funnels FOR DELETE USING (auth.uid() = tenant_id);

DROP POLICY IF EXISTS inboxes_select ON public.inboxes;
DROP POLICY IF EXISTS inboxes_insert ON public.inboxes;
DROP POLICY IF EXISTS inboxes_update ON public.inboxes;
DROP POLICY IF EXISTS inboxes_delete ON public.inboxes;
CREATE POLICY inboxes_select ON public.inboxes FOR SELECT USING (auth.uid() = tenant_id);
CREATE POLICY inboxes_insert ON public.inboxes FOR INSERT WITH CHECK (auth.uid() = tenant_id);
CREATE POLICY inboxes_update ON public.inboxes FOR UPDATE USING (auth.uid() = tenant_id);
CREATE POLICY inboxes_delete ON public.inboxes FOR DELETE USING (auth.uid() = tenant_id);

DROP POLICY IF EXISTS crm_clients_select ON public.crm_clients;
DROP POLICY IF EXISTS crm_clients_insert ON public.crm_clients;
DROP POLICY IF EXISTS crm_clients_update ON public.crm_clients;
DROP POLICY IF EXISTS crm_clients_delete ON public.crm_clients;
CREATE POLICY crm_clients_select ON public.crm_clients FOR SELECT USING (auth.uid() = tenant_id);
CREATE POLICY crm_clients_insert ON public.crm_clients FOR INSERT WITH CHECK (auth.uid() = tenant_id);
CREATE POLICY crm_clients_update ON public.crm_clients FOR UPDATE USING (auth.uid() = tenant_id);
CREATE POLICY crm_clients_delete ON public.crm_clients FOR DELETE USING (auth.uid() = tenant_id);

-- Auditoria: visível se o lead pertence ao tenant do JWT
DROP POLICY IF EXISTS lead_activity_select ON public.lead_activity;
CREATE POLICY lead_activity_select ON public.lead_activity
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.leads l
            WHERE l.id = lead_activity.lead_id AND l.tenant_id = auth.uid()
        )
    );

-- Posições: dono do board ou dono do lead
DROP POLICY IF EXISTS lead_pipeline_positions_select ON public.lead_pipeline_positions;
CREATE POLICY lead_pipeline_positions_select ON public.lead_pipeline_positions
    FOR SELECT USING (
        board_owner_user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.leads l
            WHERE l.id = lead_pipeline_positions.lead_id AND l.tenant_id = auth.uid()
        )
    );

-- =============================================================================
-- Superadmin seed (email fixo; idempotente)
-- =============================================================================
UPDATE public.profiles p
SET is_superadmin = true
FROM auth.users u
WHERE u.id = p.id
  AND lower(u.email) = lower('augustogumi@gmail.com');

-- Refresh PostgREST / Supabase API schema cache
NOTIFY pgrst, 'reload schema';

COMMIT;
