-- 007 — Sprint 4: CHECK role/funil em organization_members + phones em profiles
-- Executar no Supabase SQL Editor após revisar linhas existentes em organization_members.
-- Pré-requisito: admins sem assigned_funnel_id (UPDATE abaixo); read_only sem funil
-- devem ser corrigidos manualmente ou removidos antes do CHECK.

BEGIN;

-- Telefones múltiplos no perfil (JSON array de strings)
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS phones JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Normalizar: admin não deve carregar funil atribuído
UPDATE public.organization_members
SET assigned_funnel_id = NULL
WHERE role = 'admin';

-- CHECK: read_only exige funil; admin exige NULL
ALTER TABLE public.organization_members
    DROP CONSTRAINT IF EXISTS organization_members_role_funnel_check;

ALTER TABLE public.organization_members
    ADD CONSTRAINT organization_members_role_funnel_check
    CHECK (
        (role = 'read_only' AND assigned_funnel_id IS NOT NULL)
        OR (role = 'admin' AND assigned_funnel_id IS NULL)
    );

NOTIFY pgrst, 'reload schema';

COMMIT;
