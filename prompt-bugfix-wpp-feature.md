# 🛠️ PROMPT TÉCNICO FINAL — CRM BugFix + Features (Schema Real)

> **Leia toda a codebase antes de implementar.** Mantenha consistência com os padrões já existentes. Toda função deve gerar ação real no Supabase e/ou WhatsApp. O SQL já foi executado com sucesso — as tabelas estão prontas.

---

## 📌 MAPEAMENTO DE TABELAS (SCHEMA REAL)

```
leads             → negócios/clientes (campo stage = etapa do kanban)
orders            → pedidos
products          → produtos
profiles          → perfil do usuário
settings          → configurações (padrão key/value JSONB)
chat_messages     → mensagens WhatsApp espelhadas (JÁ EXISTE)
pipeline_stages   → etapas do funil (criada no SQL)
product_categories → categorias de produtos (criada no SQL)
promotions        → promoções (criada no SQL)
promotions_products → vínculo promoção-produto (criada no SQL)
orders_archived   → pedidos arquivados (criada no SQL)
global_search     → VIEW de busca unificada (criada no SQL)
```

### Colunas relevantes por tabela:
```
leads:          id, tenant_id, contact_name, company_name, stage, priority,
                value, notes, phone, delivery_address, whatsapp_chat_id,
                archived, deleted, order_products, created_at, updated_at

orders:         id, tenant_id, lead_id, client_name, client_company,
                product_summary, products_json, total, payment_status,
                stage, notes, created_at

products:       id, tenant_id, name, price, weight, weight_grams,
                description, category, category_id, status, is_active,
                image_url, promotion_id, created_at

profiles:       id, full_name, company_name, phone, cnpj, address,
                theme_color, preferences, tenant_id, avatar_url

settings:       id, tenant_id, key, value (JSONB)
                → WhatsApp config: WHERE key = 'whatsapp_config'
                → value: { token, status, qr_code, phone_connected,
                           lead_fields, connected_at }

chat_messages:  id, tenant_id, lead_id, whatsapp_chat_id,
                whatsapp_message_id, direction ('inbound'/'outbound'),
                content_type, content, media_url, sender_name,
                sender_phone, metadata, created_at

pipeline_stages: id, tenant_id, name, order_position, color
```

---

## 🐛 BUGFIXES — DASHBOARD

### ✅ 1. Barra de Pesquisa → Abrir Card (CONCLUÍDO)

**Arquivo:** `components/Dashboard/SearchBar.tsx`

```typescript
// Usar a VIEW global_search:
const { data } = await supabase
  .from('global_search')
  .select('id, name, type')
  .eq('tenant_id', tenantId)
  .ilike('name', `%${input}%`)
  .limit(10);

// Ao selecionar resultado:
// type === 'lead'    → abrir <LeadCard id={id} />
// type === 'order'   → abrir <OrderCard id={id} />
// type === 'product' → abrir <ProductCard id={id} />
```

---

### ✅ 2. Modal "Novo Pedido" (CONCLUÍDO)

**Arquivo:** `components/Dashboard/NewOrderModal.tsx`

```typescript
// A) Autocomplete de cliente (busca em leads):
const { data } = await supabase
  .from('leads')
  .select('id, contact_name, company_name, phone')
  .eq('tenant_id', tenantId)
  .ilike('contact_name', `%${input}%`)
  .limit(5);

// B) Criar novo lead:
const { data: newLead } = await supabase
  .from('leads')
  .insert({ tenant_id: tenantId, contact_name, company_name, phone,
            stage: 'Novo Pedido Manual' })
  .select().single();

// C) Dropdown de produtos:
const { data: products } = await supabase
  .from('products')
  .select('id, name, price')
  .eq('tenant_id', tenantId)
  .eq('is_active', true)
  .order('name');

// D) Criar pedido:
const { data: order } = await supabase
  .from('orders')
  .insert({
    tenant_id: tenantId,
    lead_id: selectedLeadId,
    client_name: selectedLead.contact_name,
    client_company: selectedLead.company_name,
    products_json: selectedProducts,
    product_summary: selectedProducts.map(p => p.name).join(', '),
    total: valorTotal,
    stage: 'Novo Pedido Manual',
    payment_status: 'pendente'
  }).select().single();
```

---

### 3. Últimos Pedidos — Botões (CONCLUÍDO)

**Arquivo:** `components/Dashboard/RecentOrders.tsx`

```typescript
// A) Ver Todos → /orders (tabela paginada)
// Query:
const { data } = await supabase
  .from('orders')
  .select('*, leads(contact_name, company_name)')
  .eq('tenant_id', tenantId)
  .order('created_at', { ascending: false });

// B) Botão verde (Chat WhatsApp):
// Buscar lead vinculado ao pedido e abrir chat pelo whatsapp_chat_id
const { data: lead } = await supabase
  .from('leads')
  .select('whatsapp_chat_id, contact_name')
  .eq('id', order.lead_id).single();

// Abrir <ChatModal whatsappChatId={lead.whatsapp_chat_id} leadId={order.lead_id} />
// Query do modal:
const { data: messages } = await supabase
  .from('chat_messages')
  .select('*')
  .eq('whatsapp_chat_id', whatsappChatId)
  .order('created_at', { ascending: true });

// C) Arquivar:
await supabase.from('orders_archived').insert({
  original_order_id: order.id,
  tenant_id: order.tenant_id,
  lead_id: order.lead_id,
  client_name: order.client_name,
  total: order.total,
  payment_status: order.payment_status
});
await supabase.from('orders').delete().eq('id', order.id);

// D) Excluir (após confirmação):
await supabase.from('orders').delete().eq('id', order.id);
```

---

### 4. Editar Perfil (CONCLUÍDO)

**Arquivo:** `pages/profile/edit.tsx`

```typescript
// Carregar dados atuais:
const { data: profile } = await supabase
  .from('profiles').select('*').eq('id', user.id).single();

// Salvar (campos editáveis):
await supabase.from('profiles').update({
  full_name, phone, cnpj, address, company_name
}).eq('id', user.id);

// Alterar senha:
await supabase.auth.updateUser({ password: newPassword });

// Email: somente leitura — exibir user.email (não está em profiles)
// <input value={user.email} disabled className="opacity-50 cursor-not-allowed" />
```

---

## 🐛 BUGFIXES — KANBAN

### 1. Fechar Filtro ao Clicar Fora (CONCLUÍDO)

```typescript
// components/Kanban/KanbanFilter.tsx
useEffect(() => {
  const handler = (e: MouseEvent) => {
    if (filterRef.current && !filterRef.current.contains(e.target as Node))
      setFilterOpen(false);
  };
  document.addEventListener('mousedown', handler);
  return () => document.removeEventListener('mousedown', handler);
}, []);
```

---

### 2. Scroll Horizontal por Arraste (CONCLUÍDO)

```typescript
// components/Kanban/KanbanBoard.tsx
const boardRef = useRef<HTMLDivElement>(null);
let isDragging = false, startX = 0, scrollLeft = 0;

const onMouseDown = (e: MouseEvent) => {
  if ((e.target as HTMLElement).closest('[data-kanban-card]')) return;
  isDragging = true;
  startX = e.pageX - boardRef.current!.offsetLeft;
  scrollLeft = boardRef.current!.scrollLeft;
};
const onMouseMove = (e: MouseEvent) => {
  if (!isDragging) return;
  e.preventDefault();
  boardRef.current!.scrollLeft = scrollLeft - (e.pageX - boardRef.current!.offsetLeft - startX) * 1.5;
};
const onMouseUp = () => { isDragging = false; };
```

---

### 3. Soma Real por Etapa  (CONCLUÍDO)

```typescript
// components/Kanban/StageColumn.tsx
// leads estão agrupados por lead.stage (campo TEXT em leads)
// Calcular no frontend a partir dos cards carregados:

const total = leads
  .filter(l => l.stage === stageName)
  .reduce((acc, l) => acc + (Number(l.value) || 0), 0);

const formatted = new Intl.NumberFormat('pt-BR', {
  style: 'currency', currency: 'BRL'
}).format(total);

// Recalcular em: onDragEnd, ao remover lead, ao adicionar lead.
// Ao mover card entre etapas:
await supabase.from('leads')
  .update({ stage: newStageName })
  .eq('id', leadId);
```

---

### 4. Chat nos Cards (CONCLUÍDO)

```typescript
// components/Kanban/KanbanCard.tsx
// onClick do ícone de chat:
// Abrir <ChatModal whatsappChatId={lead.whatsapp_chat_id} leadId={lead.id} />

const { data: messages } = await supabase
  .from('chat_messages')
  .select('id, direction, content, content_type, media_url, sender_name, created_at')
  .eq('lead_id', lead.id)
  .order('created_at', { ascending: true });

// direction === 'inbound'  → mensagem recebida (alinhar à esquerda, fundo cinza)
// direction === 'outbound' → mensagem enviada  (alinhar à direita, fundo verde)
```

---

### 5. Menu 3 Pontinhos — Funcional

```typescript
// components/Kanban/KanbanCardMenu.tsx

// "Editar Card" → modal com campos:
await supabase.from('leads').update({
  contact_name, company_name, phone, delivery_address,
  notes, value, priority, order_products: products
}).eq('id', lead.id);

// "Excluir" → confirmação → soft delete:
await supabase.from('leads')
  .update({ deleted: true })
  .eq('id', lead.id);
// Remover do state local e recalcular soma da coluna.

// REMOVER itens separados "Negócios", "Produtos", "Prioridade" do menu.
// Consolidar tudo em "Editar Card" com campo priority (select):
// baixa / normal / alta / urgente
```

---

### 6. Adicionar Card no Final de Cada Etapa

```typescript
// components/Kanban/AddLeadForm.tsx

// Máscara BRL no campo value:
const parseBRL = (str: string) =>
  parseFloat(str.replace(/[^\d,]/g, '').replace(',', '.')) || 0;

// Autocomplete de contato (busca em leads existentes):
const { data } = await supabase
  .from('leads')
  .select('id, contact_name, phone')
  .eq('tenant_id', tenantId)
  .ilike('contact_name', `%${input}%`)
  .limit(5);

// Se não existe, criar automaticamente:
const { data: newLead } = await supabase
  .from('leads')
  .insert({ tenant_id: tenantId, contact_name, phone, stage: currentStage })
  .select().single();

// Submit final:
await supabase.from('leads').insert({
  tenant_id: tenantId,
  contact_name, company_name, phone,
  value: parseBRL(valueInput),
  stage: currentStageName,
  priority: 'normal'
});
```

---

### 7. Relatórios — Valores Reais + CSV

```typescript
// components/Kanban/ReportsModal.tsx

// Query por stage agrupando leads:
const { data: stages } = await supabase
  .from('pipeline_stages')
  .select('name, order_position')
  .eq('tenant_id', tenantId)
  .order('order_position');

const { data: leads } = await supabase
  .from('leads')
  .select('stage, value')
  .eq('tenant_id', tenantId)
  .eq('archived', false)
  .eq('deleted', false);

const report = stages.map(s => ({
  stage: s.name,
  count: leads.filter(l => l.stage === s.name).length,
  total: leads.filter(l => l.stage === s.name)
              .reduce((a, l) => a + (Number(l.value) || 0), 0)
}));

// Export CSV:
const totalGeral = report.reduce((a, r) => a + r.total, 0);
const headers = ['Etapa','Qtd. Negócios','Valor Total','% do Total'];
const rows = report.map(r => [
  r.stage, r.count,
  r.total.toFixed(2),
  totalGeral > 0 ? ((r.total / totalGeral) * 100).toFixed(1) + '%' : '0%'
]);
const csv = '\uFEFF' + [headers, ...rows].map(r => r.join(',')).join('\n');
const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
const a = document.createElement('a');
a.href = URL.createObjectURL(blob);
a.download = `relatorio_${new Date().toISOString().slice(0,10)}.csv`;
a.click();
```

---

### 8. Reordenar Etapas via Drag

```typescript
// Etapas vêm de pipeline_stages (não mais de campo text em leads)
// Usar mesma lib DnD da codebase para colunas.
// Header de cada coluna = drag handle (data-drag-handle="stage")

// onDragEnd (reordenação de colunas):
const updates = newStageOrder.map((stage, index) =>
  supabase.from('pipeline_stages')
    .update({ order_position: index })
    .eq('id', stage.id)
);
await Promise.all(updates);
```

---

## 🐛 BUGFIXES — PRODUTOS

### 1. Editar Produto

```typescript
// Ícone lápis em card E em lista
// <EditProductModal product={product} />

await supabase.from('products').update({
  name, description, price: parseBRL(priceInput),
  weight_grams: Number(weightInput),
  category_id, is_active
}).eq('id', product.id);

// Recriar vínculo de promoção:
await supabase.from('products')
  .update({ promotion_id: selectedPromotionId })
  .eq('id', product.id);
```

---

### 2. CRUD de Categorias

```typescript
// Criar:
await supabase.from('product_categories')
  .insert({ tenant_id: tenantId, name, description });

// Editar:
await supabase.from('product_categories')
  .update({ name, description }).eq('id', categoryId);

// Excluir (verificar produtos vinculados antes):
const { count } = await supabase.from('products')
  .select('id', { count: 'exact', head: true })
  .eq('category_id', categoryId);

if (count > 0) {
  toast.error(`Existem ${count} produtos nessa categoria. Desvincule-os primeiro.`);
  return;
}
await supabase.from('product_categories').delete().eq('id', categoryId);
```

---

### 3. CRUD de Promoções + Vínculo com Produtos

```typescript
// Criar promoção:
const { data: promo } = await supabase.from('promotions').insert({
  tenant_id: tenantId, name, description,
  type, value: parseBRL(valueInput),
  is_active, valid_from, valid_until
}).select().single();

// Salvar vínculos (produtos selecionados nos checkboxes):
await supabase.from('promotions_products')
  .delete().eq('promotion_id', promo.id);

if (selectedProductIds.length > 0) {
  await supabase.from('promotions_products').insert(
    selectedProductIds.map(pid => ({
      promotion_id: promo.id,
      product_id: pid
    }))
  );
}
```

---

### 4. Excluir Produto

```typescript
// Botão excluir em card E em lista — modal de confirmação obrigatório.
await supabase.from('promotions_products')
  .delete().eq('product_id', productId);
await supabase.from('products')
  .delete().eq('id', productId);
```

---

### 5. Novo Produto — Máscaras

```typescript
// Preço: máscara BRL → salvar como NUMERIC
// Peso: number input com sufixo "g"
// Promoções: multi-select WHERE is_active = true

const { data: activePromos } = await supabase
  .from('promotions')
  .select('id, name, type, value')
  .eq('tenant_id', tenantId)
  .eq('is_active', true);

// Após INSERT do produto, inserir vínculos:
await supabase.from('promotions_products').insert(
  selectedPromoIds.map(pid => ({ promotion_id: pid, product_id: newProduct.id }))
);
```

---

## 🐛 BUGFIXES — CONFIGURAÇÕES

### 1. Painel Principal — Salvar Preferências

```typescript
// Usar a tabela settings (padrão key/value já existente):
await supabase.from('settings').upsert({
  tenant_id: tenantId,
  key: 'dashboard_preferences',
  value: { layout: 'grid', visible_items: ['orders','kanban','chat'] }
}, { onConflict: 'tenant_id,key' });

// Ao carregar dashboard, buscar:
const { data } = await supabase.from('settings')
  .select('value').eq('tenant_id', tenantId)
  .eq('key', 'dashboard_preferences').single();
```

### 2. Funil → Kanban
```typescript
router.push('/kanban')
```

### 3. Gerenciar Produtos → /products
```typescript
router.push('/products')
```

### 4. Bug Cor Roxa
```typescript
// Fix: habilitar "Aplicar" sempre que houver seleção
const canApply = selectedColor !== null; // remover comparação com cor padrão

// Ao aplicar:
await supabase.from('settings').upsert({
  tenant_id: tenantId, key: 'theme_color', value: { color: selectedColor }
}, { onConflict: 'tenant_id,key' });

document.documentElement.style.setProperty('--color-primary', hexColor);
```

---

## 🟢 NOVA FEATURE — CONEXÃO WHATSAPP

### UI — `components/Settings/WhatsappConfig.tsx`

```typescript
// Carregar config atual:
const { data: config } = await supabase.from('settings')
  .select('value').eq('tenant_id', tenantId)
  .eq('key', 'whatsapp_config').single();

// Status atual: config?.value?.status → 'desconectado'|'aguardando_qr'|'conectado'
```

### Fluxo de Conexão

```typescript
// 1. Salvar token:
await supabase.from('settings').upsert({
  tenant_id: tenantId,
  key: 'whatsapp_config',
  value: { token, status: 'aguardando_qr', qr_code: null }
}, { onConflict: 'tenant_id,key' });

// 2. Chamar Edge Function (NUNCA expor token no frontend):
const { data } = await supabase.functions.invoke('whatsapp-connect', {
  body: { token, tenant_id: tenantId }
});

// 3. Salvar QR Code retornado:
await supabase.from('settings').update({
  value: { token, status: 'aguardando_qr', qr_code: data.qrCode }
}).eq('tenant_id', tenantId).eq('key', 'whatsapp_config');

// 4. Polling a cada 3s:
const poll = setInterval(async () => {
  const { data: cfg } = await supabase.from('settings')
    .select('value').eq('tenant_id', tenantId)
    .eq('key', 'whatsapp_config').single();
  if (cfg?.value?.status === 'conectado') {
    clearInterval(poll);
    setConnected(true);
    setConnectedPhone(cfg.value.phone_connected);
  }
}, 3000);
```

### Edge Function — `supabase/functions/whatsapp-connect/index.ts`

```typescript
import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const { token, tenant_id } = await req.json();

  // Chamar uazapi SEM campo phone (só token no header)
  const res = await fetch("https://neurix.uazapi.com/instance/connect", {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "token": token
    },
    body: JSON.stringify({})
  });

  const data = await res.json();
  // data deve conter: { qrCode: "data:image/png;base64,..." } ou { status: "connected" }

  // Atualizar status no banco via service role:
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  if (data.status === 'connected') {
    await supabase.from('settings').update({
      value: { token, status: 'conectado', phone_connected: data.phone, connected_at: new Date().toISOString() }
    }).eq('tenant_id', tenant_id).eq('key', 'whatsapp_config');
  }

  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" }
  });
});
```

### Edge Function — Webhook de Mensagens

```typescript
// supabase/functions/whatsapp-webhook/index.ts
// Endpoint que a uazapi chama ao receber/enviar mensagens
serve(async (req) => {
  const payload = await req.json();
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // Descobrir tenant pelo token da instância
  const { data: settings } = await supabase.from('settings')
    .select('tenant_id')
    .eq('key', 'whatsapp_config')
    .contains('value', { token: payload.instanceToken })
    .single();

  await supabase.from('chat_messages').insert({
    tenant_id: settings.tenant_id,
    lead_id: payload.leadId || null,
    whatsapp_chat_id: payload.chatId,
    whatsapp_message_id: payload.messageId,
    direction: payload.fromMe ? 'outbound' : 'inbound',
    content_type: payload.type || 'text',
    content: payload.body || '',
    media_url: payload.mediaUrl || null,
    sender_name: payload.senderName || '',
    sender_phone: payload.senderPhone || '',
    metadata: payload
  });

  return new Response('ok', { status: 200 });
});
```

### Enriquecimento de Leads

```typescript
// Edge Function: supabase/functions/whatsapp-update-fields/index.ts
serve(async (req) => {
  const { token } = await req.json();

  await fetch("https://neurix.uazapi.com/instance/updateFieldsMap", {
    method: "POST",
    headers: { "Content-Type": "application/json", "token": token },
    body: JSON.stringify({
      lead_field01: "tenant_id",
      lead_field02: "lead_id",
      lead_field03: "stage",
      lead_field04: "value",
      lead_field05: "priority",
      lead_field06: "contact_name",
      lead_field07: "company_name"
    })
  });

  return new Response('ok', { status: 200 });
});
```

---

## 🧩 PADRÕES OBRIGATÓRIOS

```
1. TypeScript estrito. Sem `any`.

2. Sempre filtrar por tenant_id em TODAS as queries:
   .eq('tenant_id', tenantId)  ← sem isso dados de outros tenants vazam

3. Tratar error em toda chamada Supabase:
   const { data, error } = await supabase...
   if (error) { toast.error(error.message); return; }

4. Loading state em toda operação assíncrona.

5. Modal de confirmação ANTES de qualquer DELETE/arquivamento.

6. Formatação monetária padrão:
   new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

7. Tokens de API externos NUNCA no frontend.
   Toda chamada à uazapi via Supabase Edge Function.

8. Realtime (opcional, mas recomendado para chat):
   supabase.channel('chat').on('postgres_changes',
     { event: 'INSERT', schema: 'public', table: 'chat_messages',
       filter: `lead_id=eq.${leadId}` },
     (payload) => setMessages(prev => [...prev, payload.new])
   ).subscribe();
```

---

## 🤖 TESTES AUTOMATIZADOS (Chrome Browser)

```
Após implementar cada item, usar o Chrome Browser integrado à IDE
(Playwright/Puppeteer) apontado para https://crm.wbtech.dev/login

Executar commit e push para o repositório no GitHub, aguardar 45 segundos então iniciar o teste.

para login, use as credenciais:

Email: augustogumi@gmail.com
Senha: 123456

Executar de forma autônoma cada cenário abaixo:

DASHBOARD:
  ✦ Digitar na busca → verificar card abre pelo tipo correto
  ✦ Novo Pedido → autocomplete de lead → criar pedido → verificar em orders
  ✦ Arquivar pedido → verificar em orders_archived + sumiu de orders
  ✦ Excluir pedido → cancelar → confirmar → verificar remoção
  ✦ Editar perfil → salvar phone/cnpj → recarregar → verificar persistência

KANBAN:
  ✦ Filtro → clicar fora → verificar fechamento
  ✦ Arrastar board → verificar scroll sem mover cards
  ✦ Mover card entre colunas → verificar UPDATE leads.stage + soma atualizada
  ✦ Chat → verificar mensagens de chat_messages pelo lead.whatsapp_chat_id
  ✦ 3 pontinhos → Editar → salvar → verificar UPDATE em leads
  ✦ 3 pontinhos → Excluir → confirmar → verificar leads.deleted = true
  ✦ Adicionar card → valor "1.299,90" → verificar máscara + persistência NUMERIC
  ✦ Relatórios → verificar valores = soma real dos leads → baixar CSV
  ✦ Arrastar header de etapa → verificar UPDATE pipeline_stages.order_position

PRODUTOS:
  ✦ Lápis em card → editar nome → salvar → verificar UPDATE products
  ✦ CRUD categorias → criar/editar/excluir em product_categories
  ✦ CRUD promoções → criar → vincular produtos → verificar promotions_products
  ✦ Excluir produto → card → lista → verificar DELETE em products
  ✦ Novo produto → preço "R$ 59,90" → peso "500g" → verificar NUMERIC no banco

CONFIGURAÇÕES:
  ✦ Cor roxa → verificar botão Aplicar habilitado → salvar em settings
  ✦ Funil de Vendas → verificar redirect /kanban
  ✦ Gerenciar Produtos → verificar redirect /products

WHATSAPP:
  ✦ Inserir token → clicar Conectar → verificar QR Code exibido
  ✦ Verificar polling de status (log no console a cada 3s)
  ✦ Verificar no DevTools/Network: token NÃO aparece em requests do frontend
  ✦ Simular webhook → verificar INSERT em chat_messages

Para cada teste:
  - Screenshot ao finalizar (pass/fail)
  - Log: "✅ PASSOU: {teste}" ou "❌ FALHOU: {teste} — {motivo}"
  - Se falhar: corrigir bug automaticamente e retestar antes de continuar
  - Gerar relatório final em /test-results/relatorio_testes.txt
```

---

## ✅ CHECKLIST FINAL

```
SQL
 [x] Todas as migrações executadas com sucesso no Supabase

DASHBOARD
 [ ] Busca global abre card correto por tipo (lead/order/product)
 [ ] Novo pedido: autocomplete lead + criar lead + dropdown products
 [ ] Criar pedido: INSERT em orders + aparece no Kanban
 [ ] Arquivar: move de orders → orders_archived
 [ ] Excluir: DELETE de orders com confirmação
 [ ] Editar perfil: salva phone, cnpj, address, full_name, senha

KANBAN
 [ ] Filtro fecha ao clicar fora
 [ ] Scroll horizontal por arraste (sem interferir no DnD de cards)
 [ ] Somas por etapa calculadas dos leads.value em tempo real
 [ ] Chat abre chat_messages pelo whatsapp_chat_id do lead
 [ ] Editar card: UPDATE em leads (todos os campos)
 [ ] Excluir card: leads.deleted = true + state atualizado
 [ ] Adicionar card: máscara BRL + autocomplete + INSERT em leads
 [ ] Relatório: valores reais + export CSV com BOM UTF-8
 [ ] Reordenar etapas: UPDATE pipeline_stages.order_position

PRODUTOS
 [ ] Editar produto: funcional em card e lista
 [ ] Excluir produto: funcional em card e lista
 [ ] CRUD product_categories completo
 [ ] CRUD promotions + vínculos em promotions_products
 [ ] Novo produto: máscara preço/peso + promoções vinculadas

CONFIGURAÇÕES
 [ ] Preferências salvas em settings key='dashboard_preferences'
 [ ] Tema salvo em settings key='theme_color' + CSS var aplicada
 [ ] Bug roxo corrigido
 [ ] Redirecionamentos corretos

WHATSAPP
 [ ] Token salvo em settings key='whatsapp_config'
 [ ] Edge Function whatsapp-connect: POST sem phone, só token
 [ ] QR Code exibido após conexão
 [ ] Polling de status a cada 3s
 [ ] Webhook insere mensagens em chat_messages
 [ ] Chat espelha mensagens em tempo real (Supabase Realtime)
 [ ] Enriquecimento de leads configurado via updateFieldsMap
 [ ] Token NUNCA exposto no código frontend
```