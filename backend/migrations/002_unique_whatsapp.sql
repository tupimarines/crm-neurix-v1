-- Add unique constraint to leads table to prevent duplicate webhook leads
ALTER TABLE public.leads 
    ADD CONSTRAINT leads_tenant_id_whatsapp_chat_id_key 
    UNIQUE (tenant_id, whatsapp_chat_id);
