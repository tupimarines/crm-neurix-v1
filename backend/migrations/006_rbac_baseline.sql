-- Neurix — RBAC baseline: organizations, funnels, inboxes, CRM clients, auditoria, posições multi-funil
-- Sprint 1 (tech-spec-rbac-hierarquia-clientes-automacao-funil): executar no Supabase SQL Editor (staging → prod).
-- Idempotente: pode ser reexecutado com segurança na maior parte (tabelas/colunas IF NOT EXISTS).

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

-- PERFIS: superadmin + vínculo opcional à org
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS is_superadmin BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;

-- FUNIS (board lógico; backfill funnel_id em stages/leads nas sprints seguintes)
CREATE TABLE IF NOT EXISTS public.funnels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_funnels_tenant ON public.funnels(tenant_id);

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

-- CAIXAS DE ENTRADA (1 funil por caixa; N caixas por funil)
CREATE TABLE IF NOT EXISTS public.inboxes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    funnel_id UUID NOT NULL REFERENCES public.funnels(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    uazapi_settings JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inboxes_funnel ON public.inboxes(funnel_id);
CREATE INDEX IF NOT EXISTS idx_inboxes_tenant ON public.inboxes(tenant_id);

-- LEADS: origem inbox / funil (client_id após crm_clients)
ALTER TABLE public.leads
    ADD COLUMN IF NOT EXISTS inbox_id UUID REFERENCES public.inboxes(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS funnel_id UUID REFERENCES public.funnels(id) ON DELETE SET NULL;

-- ETAPAS: associação ao funil (backfill antes de NOT NULL em produção — Sprint 5)
ALTER TABLE public.pipeline_stages
    ADD COLUMN IF NOT EXISTS funnel_id UUID REFERENCES public.funnels(id) ON DELETE CASCADE;

-- AUDITORIA DE MOVIMENTAÇÃO
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

-- CLIENTES CRM
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

-- POSICIONAMENTO MULTI-FUNIL (ADR-001)
CREATE TABLE IF NOT EXISTS public.lead_pipeline_positions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    funnel_id UUID NOT NULL REFERENCES public.funnels(id) ON DELETE CASCADE,
    stage_id UUID NOT NULL REFERENCES public.pipeline_stages(id) ON DELETE CASCADE,
    board_owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    UNIQUE (lead_id, funnel_id, board_owner_user_id)
);

CREATE INDEX IF NOT EXISTS idx_lead_pipeline_positions_lead ON public.lead_pipeline_positions(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_pipeline_positions_board ON public.lead_pipeline_positions(board_owner_user_id, funnel_id);

-- =============================================================================
-- updated_at (reutiliza função existente em 001_initial_schema.sql)
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
-- RLS (alinhado ao isolamento por tenant / membership; API service role ignora RLS)
-- =============================================================================

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funnels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inboxes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_pipeline_positions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS organizations_select ON public.organizations;
CREATE POLICY organizations_select ON public.organizations FOR SELECT
    USING (
        EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_superadmin = true)
        OR id IN (SELECT om.organization_id FROM public.organization_members om WHERE om.user_id = auth.uid())
    );

DROP POLICY IF EXISTS organization_members_select ON public.organization_members;
CREATE POLICY organization_members_select ON public.organization_members FOR SELECT
    USING (
        user_id = auth.uid()
        OR organization_id IN (
            SELECT om.organization_id FROM public.organization_members om WHERE om.user_id = auth.uid()
        )
        OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_superadmin = true)
    );

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

DROP POLICY IF EXISTS lead_activity_select ON public.lead_activity;
CREATE POLICY lead_activity_select ON public.lead_activity FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.leads l
            WHERE l.id = lead_activity.lead_id AND l.tenant_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS lead_pipeline_positions_select ON public.lead_pipeline_positions;
CREATE POLICY lead_pipeline_positions_select ON public.lead_pipeline_positions FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.leads l
            WHERE l.id = lead_pipeline_positions.lead_id AND l.tenant_id = auth.uid()
        )
        OR board_owner_user_id = auth.uid()
    );

-- SUPERADMIN SEED (S1-T3): confirmar com SELECT após o COMMIT (ver comentário final)
UPDATE public.profiles p
SET is_superadmin = true
FROM auth.users u
WHERE u.id = p.id
  AND lower(u.email) = lower('augustogumi@gmail.com');

COMMIT;

-- Validação sugerida no SQL Editor (rodar após o script):
-- SELECT id, is_superadmin FROM public.profiles p JOIN auth.users u ON u.id = p.id WHERE lower(u.email) = lower('augustogumi@gmail.com');
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN (
--   'organizations','organization_members','funnels','inboxes','crm_clients','lead_activity','lead_pipeline_positions'
-- );
