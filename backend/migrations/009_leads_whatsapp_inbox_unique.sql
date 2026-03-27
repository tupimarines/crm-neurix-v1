  -- 009_leads_whatsapp_inbox_unique.sql
  -- Sprint 9 — UNIQUE por caixa: (inbox_id, whatsapp_chat_id) quando inbox definido;
  -- legado: (tenant_id, whatsapp_chat_id) apenas quando inbox_id IS NULL.
  --
  -- Ordem: após 008 (backfill funnel). Executar no Supabase SQL Editor (staging antes de prod).
  -- Reexecução: DROP CONSTRAINT/INDEX IF EXISTS abaixo.

  BEGIN;

  -- Remove o UNIQUE global (tenant_id, whatsapp_chat_id) que impede o mesmo JID em duas caixas.
  ALTER TABLE public.leads
      DROP CONSTRAINT IF EXISTS leads_tenant_id_whatsapp_chat_id_key;

  -- Mesmo chat em duas inboxes distintas: permitido.
  CREATE UNIQUE INDEX IF NOT EXISTS leads_inbox_whatsapp_chat_unique
      ON public.leads (inbox_id, whatsapp_chat_id)
      WHERE inbox_id IS NOT NULL
        AND whatsapp_chat_id IS NOT NULL;

  -- Leads antigos ou fluxo sem inbox (inbox_id NULL): mantém unicidade por tenant + JID.
  CREATE UNIQUE INDEX IF NOT EXISTS leads_tenant_whatsapp_legacy_unique
      ON public.leads (tenant_id, whatsapp_chat_id)
      WHERE inbox_id IS NULL
        AND whatsapp_chat_id IS NOT NULL;

  COMMIT;
