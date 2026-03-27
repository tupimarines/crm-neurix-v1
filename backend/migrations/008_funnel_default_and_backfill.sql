-- 008_funnel_default_and_backfill.sql
-- Sprint 5 — Funil "Default" por tenant + backfill de funnel_id (idempotente).
--
-- Ordem / notas (S5-T3):
-- 1) Pré-requisitos: migrações 006 (RBAC baseline) e 007 aplicadas no mesmo projeto.
-- 2) Executar no Supabase SQL Editor (staging antes de produção). Reexecução segura.
-- 3) Validar: SELECT count(*) FROM pipeline_stages WHERE funnel_id IS NULL; idem leads.
--    Linhas que permanecerem NULL costumam ter tenant_id sem correspondência em auth.users
--    (dados órfãos) — ver bloco comentado no final para diagnóstico.
-- 4) NÃO aplicar NOT NULL em funnel_id até validação 100% (AC14).

BEGIN;

-- -----------------------------------------------------------------------------
-- S5-T1 — Funil "Default" para cada tenant (auth.users) com estágios, leads ou funis.
-- -----------------------------------------------------------------------------
INSERT INTO public.funnels (tenant_id, name, created_at, updated_at)
SELECT DISTINCT u.id, 'Default', now(), now()
FROM auth.users AS u
INNER JOIN (
    SELECT tenant_id FROM public.pipeline_stages
    UNION
    SELECT tenant_id FROM public.leads
    UNION
    SELECT tenant_id FROM public.funnels
) AS src ON src.tenant_id = u.id
WHERE src.tenant_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.funnels f
    WHERE f.tenant_id = u.id
      AND f.name = 'Default'
  );

-- -----------------------------------------------------------------------------
-- S5-T1b — Catch-up: tenants que ainda têm estágio/lead sem funnel_id mas já existem em auth.
-- (Cobre ordens de execução ou casos em que o primeiro INSERT não preencheu tudo.)
-- -----------------------------------------------------------------------------
INSERT INTO public.funnels (tenant_id, name, created_at, updated_at)
SELECT DISTINCT u.id, 'Default', now(), now()
FROM auth.users AS u
WHERE (
    EXISTS (
        SELECT 1
        FROM public.pipeline_stages ps
        WHERE ps.tenant_id = u.id
          AND ps.funnel_id IS NULL
    )
    OR EXISTS (
        SELECT 1
        FROM public.leads l
        WHERE l.tenant_id = u.id
          AND l.funnel_id IS NULL
    )
)
AND NOT EXISTS (
    SELECT 1
    FROM public.funnels f
    WHERE f.tenant_id = u.id
      AND f.name = 'Default'
);

-- -----------------------------------------------------------------------------
-- S5-T2 — Backfill: um funil por tenant (preferência: nome 'Default', senão o mais antigo).
-- DISTINCT ON evita erro/ambiguidade se houver mais de um funil por tenant.
-- -----------------------------------------------------------------------------
UPDATE public.pipeline_stages AS ps
SET funnel_id = pick.id
FROM (
    SELECT DISTINCT ON (tenant_id)
        id,
        tenant_id
    FROM public.funnels
    ORDER BY
        tenant_id,
        (name = 'Default') DESC,
        created_at ASC
) AS pick
WHERE ps.funnel_id IS NULL
  AND ps.tenant_id = pick.tenant_id;

UPDATE public.leads AS l
SET funnel_id = pick.id
FROM (
    SELECT DISTINCT ON (tenant_id)
        id,
        tenant_id
    FROM public.funnels
    ORDER BY
        tenant_id,
        (name = 'Default') DESC,
        created_at ASC
) AS pick
WHERE l.funnel_id IS NULL
  AND l.tenant_id = pick.tenant_id;

COMMIT;

-- Diagnóstico opcional (executar fora da transação) se ainda houver NULL:
--
-- Órfãos (tenant_id sem usuário em auth — não dá para criar funil por FK):
-- SELECT 'pipeline_stages' AS t, tenant_id, count(*)
-- FROM public.pipeline_stages WHERE funnel_id IS NULL GROUP BY tenant_id
-- HAVING tenant_id IS NOT NULL AND tenant_id NOT IN (SELECT id FROM auth.users);
--
-- SELECT 'leads' AS t, tenant_id, count(*)
-- FROM public.leads WHERE funnel_id IS NULL GROUP BY tenant_id
-- HAVING tenant_id IS NOT NULL AND tenant_id NOT IN (SELECT id FROM auth.users);
