# Configuração SMTP Brevo no Supabase

> **SMTP_ADMIN_EMAIL:** Use `a3b1e4001@smtp-brevo.com` (seu remetente verificado na Brevo).  
> Gmail não funciona diretamente — o Brevo bloqueia domínios não verificados.  
> Se quiser um remetente personalizado (ex: `noreply@seudominio.com`), configure um sender na Brevo com verificação de DNS.

> **CORS Origins:** Mantenha `*` durante desenvolvimento/testes no Dokploy. Troque pelo domínio exato só em produção com domínio próprio.

Para que o Supabase Auth envie emails de confirmação e 2FA via Brevo, atualize as seguintes variáveis no `.env` do Docker Compose do Supabase no Dokploy:

```env
# ── SMTP (Brevo) — Substituir as linhas existentes ──
SMTP_ADMIN_EMAIL=a3b1e4001@smtp-brevo.com  # Endereço verificado na Brevo. Poderia ser outro domínio verificado.
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=a3b1e4001@smtp-brevo.com
SMTP_PASS=<sua-senha-smtp-brevo>
SMTP_SENDER_NAME=Neurix CRM

# ── Auth URLs — Apontar para o domínio do seu CRM ──
SITE_URL=http://crmneurix-pre0225supabase-eb4832-187-77-35-167.traefik.me
ADDITIONAL_REDIRECT_URLS=http://crmneurix-pre0225supabase-eb4832-187-77-35-167.traefik.me/*,http://localhost:3000/*
API_EXTERNAL_URL=http://crmneurix-pre0225supabase-eb4832-187-77-35-167.traefik.me
SUPABASE_PUBLIC_URL=http://crmneurix-pre0225supabase-eb4832-187-77-35-167.traefik.me

# ── Recomendações de Segurança ──
# 1. Ativar HTTPS via Traefik para criptografar tráfego
# 2. Alterar JWT_SECRET, ANON_KEY, SERVICE_ROLE_KEY em produção
# 3. Considerar habilitar ENABLE_EMAIL_AUTOCONFIRM=false para 2FA
```

## Como aplicar:
1. No Dokploy, vá às configurações do serviço Supabase
2. Edite as variáveis de ambiente conforme acima
3. Reinicie os containers (Redeploy)
4. Teste enviando um email de confirmação via Supabase Dashboard
