-- Neurix CRM — Database Schema
-- Execute this in the Supabase SQL Editor or via migration

-- ============================================================
-- 1. PROFILES (extends Supabase Auth users)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT,
    avatar_url TEXT,
    company_name TEXT,
    role TEXT DEFAULT 'admin',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name)
    VALUES (new.id, new.raw_user_meta_data->>'full_name');
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 2. LEADS (Kanban Cards)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    company_name TEXT NOT NULL,
    contact_name TEXT NOT NULL,
    stage TEXT NOT NULL DEFAULT 'contato_inicial'
        CHECK (stage IN ('contato_inicial', 'escolhendo_sabores', 'aguardando_pagamento', 'enviado')),
    priority TEXT CHECK (priority IN ('alta', 'media', 'baixa')),
    value NUMERIC(12,2) DEFAULT 0,
    notes TEXT,
    whatsapp_chat_id TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leads_tenant ON public.leads(tenant_id);
CREATE INDEX IF NOT EXISTS idx_leads_stage ON public.leads(stage);
CREATE INDEX IF NOT EXISTS idx_leads_whatsapp ON public.leads(whatsapp_chat_id);

-- ============================================================
-- 3. PRODUCTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    price NUMERIC(10,2) NOT NULL DEFAULT 0,
    weight TEXT,
    description TEXT,
    category TEXT DEFAULT 'tradicional'
        CHECK (category IN ('tradicional', 'diet_zero', 'gourmet', 'sazonal')),
    status TEXT DEFAULT 'em_estoque'
        CHECK (status IN ('em_estoque', 'baixo_estoque', 'esgotado', 'rascunho')),
    lot_code TEXT,
    image_url TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_tenant ON public.products(tenant_id);

-- ============================================================
-- 4. ORDERS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
    client_name TEXT NOT NULL,
    client_company TEXT,
    product_summary TEXT NOT NULL,
    total NUMERIC(12,2) NOT NULL DEFAULT 0,
    payment_status TEXT DEFAULT 'pendente'
        CHECK (payment_status IN ('pago', 'pendente', 'cancelado')),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_tenant ON public.orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(payment_status);

-- ============================================================
-- 5. CHAT MESSAGES (WhatsApp mirror)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
    whatsapp_chat_id TEXT NOT NULL,
    whatsapp_message_id TEXT,
    direction TEXT NOT NULL DEFAULT 'incoming'
        CHECK (direction IN ('incoming', 'outgoing')),
    content_type TEXT DEFAULT 'text'
        CHECK (content_type IN ('text', 'image', 'video', 'audio', 'document', 'sticker', 'reaction', 'location', 'contact')),
    content TEXT,
    media_url TEXT,
    media_mimetype TEXT,
    media_filename TEXT,
    caption TEXT,
    quoted_message_id TEXT,
    sender_name TEXT,
    sender_phone TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_lead ON public.chat_messages(lead_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_whatsapp ON public.chat_messages(whatsapp_chat_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON public.chat_messages(created_at DESC);

-- ============================================================
-- 6. SETTINGS (Key-Value per tenant)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    value JSONB NOT NULL DEFAULT '""',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(tenant_id, key)
);

CREATE INDEX IF NOT EXISTS idx_settings_tenant ON public.settings(tenant_id);

-- ============================================================
-- 7. KEYWORD RULES (Editable keyword engine rules)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.keyword_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    keywords TEXT[] NOT NULL DEFAULT '{}',
    target_stage TEXT NOT NULL
        CHECK (target_stage IN ('contato_inicial', 'escolhendo_sabores', 'aguardando_pagamento', 'enviado')),
    priority INTEGER DEFAULT 1,
    label TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_keyword_rules_tenant ON public.keyword_rules(tenant_id);

-- ============================================================
-- 8. ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.keyword_rules ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read/update their own profile
CREATE POLICY profiles_select ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY profiles_update ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Leads: tenant isolation
CREATE POLICY leads_select ON public.leads FOR SELECT USING (auth.uid() = tenant_id);
CREATE POLICY leads_insert ON public.leads FOR INSERT WITH CHECK (auth.uid() = tenant_id);
CREATE POLICY leads_update ON public.leads FOR UPDATE USING (auth.uid() = tenant_id);
CREATE POLICY leads_delete ON public.leads FOR DELETE USING (auth.uid() = tenant_id);

-- Products: tenant isolation
CREATE POLICY products_select ON public.products FOR SELECT USING (auth.uid() = tenant_id);
CREATE POLICY products_insert ON public.products FOR INSERT WITH CHECK (auth.uid() = tenant_id);
CREATE POLICY products_update ON public.products FOR UPDATE USING (auth.uid() = tenant_id);
CREATE POLICY products_delete ON public.products FOR DELETE USING (auth.uid() = tenant_id);

-- Orders: tenant isolation
CREATE POLICY orders_select ON public.orders FOR SELECT USING (auth.uid() = tenant_id);
CREATE POLICY orders_insert ON public.orders FOR INSERT WITH CHECK (auth.uid() = tenant_id);
CREATE POLICY orders_update ON public.orders FOR UPDATE USING (auth.uid() = tenant_id);

-- Chat Messages: tenant isolation
CREATE POLICY messages_select ON public.chat_messages FOR SELECT USING (auth.uid() = tenant_id);
CREATE POLICY messages_insert ON public.chat_messages FOR INSERT WITH CHECK (auth.uid() = tenant_id);

-- Settings: tenant isolation
CREATE POLICY settings_select ON public.settings FOR SELECT USING (auth.uid() = tenant_id);
CREATE POLICY settings_insert ON public.settings FOR INSERT WITH CHECK (auth.uid() = tenant_id);
CREATE POLICY settings_update ON public.settings FOR UPDATE USING (auth.uid() = tenant_id);

-- Keyword Rules: tenant isolation
CREATE POLICY keyword_rules_select ON public.keyword_rules FOR SELECT USING (auth.uid() = tenant_id);
CREATE POLICY keyword_rules_insert ON public.keyword_rules FOR INSERT WITH CHECK (auth.uid() = tenant_id);
CREATE POLICY keyword_rules_update ON public.keyword_rules FOR UPDATE USING (auth.uid() = tenant_id);
CREATE POLICY keyword_rules_delete ON public.keyword_rules FOR DELETE USING (auth.uid() = tenant_id);

-- Service role bypass for webhook worker (uses SERVICE_ROLE_KEY)
-- The service_role key bypasses RLS by default in Supabase

-- ============================================================
-- 9. UPDATED_AT TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER leads_updated_at BEFORE UPDATE ON public.leads
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER settings_updated_at BEFORE UPDATE ON public.settings
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER keyword_rules_updated_at BEFORE UPDATE ON public.keyword_rules
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
