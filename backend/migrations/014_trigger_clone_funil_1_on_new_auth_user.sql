-- 014_trigger_clone_funil_1_on_new_auth_user.sql
-- Após INSERT em auth.users, clona o funil modelo "funil-1" do admin@villadora.com para o novo tenant.
--
-- Comportamento:
--   - Idempotente por usuário (se já existe funil-1, não faz nada).
--   - Não lança exceção se admin ou funil modelo ainda não existirem (signup não quebra).
--   - Não clona para o próprio admin (evita duplicar no primeiro cadastro do template).
--
-- Pré-requisito: extensão pgcrypto (gen_random_uuid) — já usada no 013.
-- Rodar no SQL Editor do Supabase com privilégios que criem trigger em auth.users.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.clone_funil_1_from_admin_for_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_admin_id uuid;
    v_src_funnel_id uuid;
    v_new_funnel_id uuid;
BEGIN
    IF p_user_id IS NULL THEN
        RETURN;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.funnels f
        WHERE f.tenant_id = p_user_id
          AND lower(trim(f.name)) = 'funil-1'
    ) THEN
        RETURN;
    END IF;

    SELECT u.id
    INTO v_admin_id
    FROM auth.users u
    WHERE lower(trim(u.email)) = lower(trim('admin@villadora.com'))
    LIMIT 1;

    IF v_admin_id IS NULL OR p_user_id = v_admin_id THEN
        RETURN;
    END IF;

    SELECT f.id
    INTO v_src_funnel_id
    FROM public.funnels f
    WHERE f.tenant_id = v_admin_id
      AND lower(trim(f.name)) = 'funil-1'
    ORDER BY f.created_at ASC
    LIMIT 1;

    IF v_src_funnel_id IS NULL THEN
        RETURN;
    END IF;

    v_new_funnel_id := gen_random_uuid();

    INSERT INTO public.funnels (id, tenant_id, name, created_at, updated_at)
    VALUES (v_new_funnel_id, p_user_id, 'Funil-1', now(), now());

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
        p_user_id,
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
END;
$$;

COMMENT ON FUNCTION public.clone_funil_1_from_admin_for_user(uuid) IS
    'Clona funil-1 do admin@villadora.com para p_user_id se ainda não existir (uso manual ou trigger).';

CREATE OR REPLACE FUNCTION public.trg_auth_user_created_clone_funil_1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    PERFORM public.clone_funil_1_from_admin_for_user(NEW.id);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_clone_funil_1 ON auth.users;

CREATE TRIGGER on_auth_user_created_clone_funil_1
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_auth_user_created_clone_funil_1();

REVOKE ALL ON FUNCTION public.clone_funil_1_from_admin_for_user(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trg_auth_user_created_clone_funil_1() FROM PUBLIC;

NOTIFY pgrst, 'reload schema';

COMMIT;
