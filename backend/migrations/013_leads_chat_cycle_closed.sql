-- 013_leads_chat_cycle_closed.sql
-- Marca encerramento do ciclo WhatsApp no card (além de whatsapp_chat_id NULL).
-- Preenchido em spawn_fresh_lead_after_finalized ao finalizar; usado por regras de espelho de chat.

ALTER TABLE public.leads
    ADD COLUMN IF NOT EXISTS chat_cycle_closed_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.leads.chat_cycle_closed_at IS
    'Timestamp em que o vínculo ativo do card com o chat WhatsApp foi encerrado (ex.: ao ir para Finalizado e liberar o JID para um novo lead).';

CREATE INDEX IF NOT EXISTS idx_leads_chat_cycle_closed
    ON public.leads (tenant_id)
    WHERE chat_cycle_closed_at IS NOT NULL;
