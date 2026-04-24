-- 013_clone_funil_1_from_admin_villadora.sql
-- Clona o funil nomeado "Funil-1" / "funil-1" do usuário admin@villadora.com para todos os
-- demais usuários (auth.users) que ainda não possuem um funil com o mesmo nome normalizado.
--
-- Pré-requisitos:
--   1) Existe usuário com email admin@villadora.com e funil cujo trim(lower(name)) = 'funil-1'.
--   2) Rodar no SQL Editor do Supabase com role que leia auth.users e escreva em public.*.
--
-- Idempotente: não duplica funil-1 por tenant.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
    v_admin_id uuid;
    v_src_funnel_id uuid;
    r_user record;
    v_new_funnel_id uuid;
BEGIN
    SELECT id INTO v_admin_id
    FROM auth.users
    WHERE lower(trim(email)) = lower(trim('admin@villadora.com'))
    LIMIT 1;

    IF v_admin_id IS NULL THEN
        RAISE EXCEPTION 'Usuário admin@villadora.com não encontrado em auth.users.';
    END IF;

    SELECT f.id INTO v_src_funnel_id
    FROM public.funnels f
    WHERE f.tenant_id = v_admin_id
      AND lower(trim(f.name)) = 'funil-1'
    ORDER BY f.created_at ASC
    LIMIT 1;

    IF v_src_funnel_id IS NULL THEN
        RAISE EXCEPTION 'Funil "funil-1" não encontrado para admin@villadora.com.';
    END IF;

    FOR r_user IN
        SELECT u.id AS uid
        FROM auth.users u
        WHERE u.id IS DISTINCT FROM v_admin_id
    LOOP
        IF EXISTS (
            SELECT 1
            FROM public.funnels f
            WHERE f.tenant_id = r_user.uid
              AND lower(trim(f.name)) = 'funil-1'
        ) THEN
            CONTINUE;
        END IF;

        v_new_funnel_id := gen_random_uuid();

        INSERT INTO public.funnels (id, tenant_id, name, created_at, updated_at)
        VALUES (v_new_funnel_id, r_user.uid, 'Funil-1', now(), now());

        INSERT INTO public.pipeline_stages (
            id,
            tenant_id,
            name,
            color,
            order_position,
            version,
            created_at,
            updated_at,
            funnel_id,
            is_conversion
        )
        SELECT
            gen_random_uuid(),
            r_user.uid,
            ps.name,
            ps.color,
            ps.order_position,
            COALESCE(ps.version, 1),
            now(),
            now(),
            v_new_funnel_id,
            COALESCE(ps.is_conversion, false)
        FROM public.pipeline_stages ps
        WHERE ps.funnel_id = v_src_funnel_id
          AND ps.tenant_id = v_admin_id
        ORDER BY ps.order_position ASC, ps.created_at ASC;
    END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
