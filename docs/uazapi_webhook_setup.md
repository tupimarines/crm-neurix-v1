# Configuração do Webhook Uazapi → Neurix CRM

## Como funciona o Webhook

Quando alguém envia uma mensagem no WhatsApp, a Uazapi envia os dados dessa mensagem para a URL do webhook cadastrada. O Neurix CRM recebe esses dados, salva na tabela `chat_messages` e analisa keywords para mover leads automaticamente no Kanban.

## Como funciona o UAZAPI_WEBHOOK_SECRET

O **webhook secret** é uma senha compartilhada entre o Neurix CRM e a Uazapi. Ele é incluído na URL do webhook como parâmetro (`?secret=XXXX`). Quando a Uazapi envia um evento, o backend verifica se o secret na URL bate com o configurado no `.env`. Se não bater, a requisição é rejeitada com erro 403.

**Isso protege contra**: qualquer pessoa que descubra a URL do webhook não conseguirá enviar dados falsos para o CRM.

---

## Passo a Passo

### 1. Gerar o Webhook Secret

Após o backend estar rodando, acesse:

```
GET https://crm.wbtech.dev/api/webhooks/generate-secret
```

A resposta terá formato:
```json
{
  "secret": "abc123xyz_seu_secret_aqui",
  "example_webhook_url": "https://crm.wbtech.dev/api/webhooks/uazapi?secret=abc123xyz_seu_secret_aqui"
}
```

### 2. Configurar o .env do Backend

Copie o secret gerado e coloque no `.env`:

```env
UAZAPI_WEBHOOK_SECRET=abc123xyz_seu_secret_aqui
```

Reinicie o backend para aplicar.

### 3. Configurar o Webhook na Uazapi

No painel admin da Uazapi, abra a configuração de **Webhooks globais**:

| Campo | Valor |
|-------|-------|
| **Habilitado** | ✅ Ligado |
| **URL** | `https://crm.wbtech.dev/api/webhooks/uazapi?secret=SEU_SECRET_AQUI` |
| **addUrlEvents** | ❌ Desligado |
| **addUrlTypesMessages** | ❌ Desligado |
| **Escutar eventos** | `messages` |
| **Excluir dos eventos escutados** | `wasSentByApi` (opcional — evita loop) |

> **Nota**: O `wasSentByApi` na exclusão evita que mensagens enviadas pelo próprio CRM (via API) sejam reprocessadas em loop. Porém, se quiser ver no CRM as mensagens enviadas pela API, **não exclua** esse evento — o worker já lida com mensagens `fromMe` corretamente.

### 4. Testar

1. Envie uma mensagem de WhatsApp para o número conectado na Uazapi
2. Verifique no Supabase se apareceu um registro novo na tabela `chat_messages`
3. Se não aparecer, verifique os logs do worker (`webhook_processor.py`)

---

## Arquitetura do Fluxo

```
WhatsApp → Uazapi → POST /api/webhooks/uazapi?secret=XXX → Redis Queue → Worker → Supabase (chat_messages)
```

```
CRM UI → POST /api/leads/{id}/messages/send → Uazapi API (/send/text ou /send/media) → WhatsApp
```
