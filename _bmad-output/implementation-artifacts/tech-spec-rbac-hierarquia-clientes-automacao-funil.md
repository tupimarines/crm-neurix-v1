---
title: 'RBAC, hierarquia multi-tenant, clientes CRM e automação de estágio'
slug: 'rbac-hierarquia-clientes-automacao-funil'
created: '2026-03-26T12:00:00Z'
status: 'ready-for-dev'
stepsCompleted: [1, 2, 3, 4]
finalized: '2026-03-26'
tech_stack:
  - Python 3 / FastAPI (API REST, Pydantic v2)
  - Next.js (App Router) / React — frontend-next
  - Supabase (Postgres, Auth JWT; cliente backend com SERVICE ROLE)
  - Redis — workers / filas (webhook)
  - Supabase Python client (queries via `.table(...).eq("tenant_id", user.id)`)
  - Deploy — VPS com **Dokploy** (stack containerizada)
  - WhatsApp — API não oficial **Uazapi** (conexão direta; webhooks/worker já existentes)
files_to_modify:
  - backend/app/dependencies.py
  - backend/app/main.py
  - backend/app/routers/leads.py
  - backend/app/routers/whatsapp.py
  - backend/app/routers/products.py
  - backend/app/routers/promotions.py
  - backend/app/workers/webhook_processor.py
  - backend/migrations/*.sql
  - frontend-next/app/(dashboard)/kanban/page.tsx
  - frontend-next/app/(dashboard)/configuracoes/page.tsx
  - frontend-next/app/(admin)/admin/**/* (Console Admin superadmin)
  - frontend-next/app/login/page.tsx (CTA Console Admin condicional)
  - frontend-next/components/sidebar.tsx (link Admin opcional)
  - backend/app/routers/auth.py (estender GET /api/auth/me — is_superadmin)
  - backend/app/routers/products.py (opcional GET admin por tenant_id)
  - _bmad-output/implementation-artifacts/tech-spec-admin-console-ui-rbac-complemento.md (spec complementar UI; integrada aos sprints 5+ abaixo)
related_specs:
  - tech-spec-admin-console-ui-rbac-complemento.md
code_patterns:
  - "get_supabase" usa SERVICE ROLE — RLS não se aplica nas rotas FastAPI; isolamento é manual com .eq(tenant_id, user.id) após JWT
  - Kanban GET agrupa leads por leads.stage (nome) alinhado a pipeline_stages.name; move em PATCH .../stage atualiza coluna stage (texto)
  - Etapas CRUD em /api/leads/stages/* com versionamento otimista (409 em conflito)
  - Modelos Pydantic em backend/app/models/lead.py
  - Configurações WhatsApp hoje em configuracoes/page.tsx + API whatsapp; evoluir para CRUD de inboxes com vínculo funnel_id
test_patterns:
  - Backend scripts de teste soltos (test_*.py na raiz de backend/) — pytest-style ad hoc; sem suíte frontend *.test encontrada no frontend-next
---

# Tech-Spec: RBAC, hierarquia multi-tenant, clientes CRM e automação de estágio

**Created:** 2026-03-26

## Overview

### Problem Statement

O CRM Neurix hoje trata cada usuário autenticado como um **tenant isolado** (`tenant_id` nos dados), com `profiles.role` padrão `admin` sem distinção de **superadmin**, sem **hierarquia** (organização → usuários com papéis admin vs. somente leitura), sem **CRUD centralizado de usuários** nem **CRUD de clientes** desacoplado dos cards de negócio. **Leads** concentram negócio e contato; não existe modelo explícito de cliente (PF/PJ) com endereço e múltiplos telefones. A integração WhatsApp (**Uazapi**) aparece como **configuração única** por tenant, sem conceito de **caixa de entrada** nem vínculo explícito **funil ↔ instância**; não há suporte a **vários funis** por organização nem segmentação de cards quando o mesmo funil recebe tráfego de mais de uma origem. Também não há **automações por etapa de funil** (ex.: mesmo lead visível em outro funil/usuário para logística).

### Solution

Introduzir um modelo de **identidade e autorização** em camadas: **superadmin** (controle global de contas/admin); entidade **`organizations`** com **N usuários**; papéis **admin** (CRUD de produtos, funis, clientes, etc.) e **read_only** (definido na criação do usuário pelo admin; hierarquia baixa). Persistir **clientes CRM** (PF/PJ) vinculados a telefone(s), integrados ao fluxo de **nova conversa** (webhook) e ao preenchimento de cards. **Caixas de entrada (inboxes)** baseadas na conexão **Uazapi**: substituir a UX de “configurar WhatsApp” por **gestão de caixas de entrada**; cada caixa tem **nome**, credenciais/conexão (instância, QR, ou recuperação de instância já conectada via fluxo **Leads Infinitos**/token, como hoje) e **um único funil vinculado** — **várias caixas podem apontar para o mesmo funil**, mas **cada caixa só pode ter um funil**. Quando um funil tiver mais de uma caixa, os **cards devem indicar a caixa de origem** (filtro, selo ou coluna lógica) para distinguir leads. Suportar **múltiplos funis** por admin/organização (criação, listagem, CRUD de funis próprios e, conforme permissão, de outros usuários). **Automação de estágio**: o mesmo lead **visível** em dois funis/contextos permanece **um registro** com atualização automática. UI **“Automação”** no Kanban. **Read-only** com regras já definidas + **auditoria** de movimentações; **cada read_only** tem **um único funil** fixo, **escolhido pelo admin na criação**, sem acesso aos demais funis da organização. **Runtime**: dados no **Supabase**; aplicação em **VPS** via **Dokploy**; mensageria WhatsApp continua pela **Uazapi** (API não oficial). Para o **superadmin**, o plano inclui um **Console Admin** (UI em **`/admin`**) descrito no documento complementar `tech-spec-admin-console-ui-rbac-complemento.md` e **integrado aos sprints 5–14** neste documento (secção **Console Admin (superadmin) — integração ao plano**), cobrindo CRUD global de organizações, membros, usuários (Auth Admin), funis/produtos por tenant, ligação a Configurações/Inboxes e clientes CRM quando as APIs estiverem prontas.

### Scope

**In Scope:**

1. Promover **augustogumi@gmail.com** a **superadmin** (migração/seed ou script idempotente documentado).
2. **CRUD de usuários** (superadmin sobre todos; escopo a definir para admin sobre “sua” organização), com campos: email, nome da empresa, nome do usuário, **telefones múltiplos** (lista).
3. **Hierarquia**: superadmin → **`organizations`** (ex.: “Geleias Villadora”) → usuários com papel **admin** ou **read_only** (definido na criação). Admin: CRUD amplo. Read-only: sem criar/editar **etapas** nem **cards**; pode **mover card entre etapas** e abrir card/chat; **auditoria** obrigatória dessas ações. **Visibilidade de funil (read_only):** na criação do usuário, o **admin obrigatoriamente atribui um único funil** a esse usuário; o read_only **só pode ver e operar** (no limite do papel) nesse funil — **não** vê outros funis da organização nem seletor para troca de funil.
4. **CRUD de clientes** (entidade separada ou extensão clara do modelo), com tipo **PF/PJ**, máscaras **CPF** e **CNPJ**, nome pessoa/empresa, contato, endereço completo (rua, bairro, CEP, cidade, estado, complemento, flags “sem número” / “rua sem saída” ou equivalente).
5. **Nova conversa / webhook**: ao iniciar conversa, **resolver cliente por telefone** (normalizado), criar se não existir, ou carregar existente e **popular dados no card/lead** quando aplicável.
6. **Automação de estágio**: bloco **“Automação”** acima de “Adicionar” no contexto da coluna; modal para criar/editar automações persistidas; primeira regra — ao **mover ou criar** card na etapa de origem, o **mesmo lead** passa a aparecer também na etapa/funil do destino (**visão dupla** do mesmo registro, atualização automática); seleção de **outro usuário** (lista sob o mesmo admin) + etapa do funil destino.
7. **Caixas de entrada (inboxes) + WhatsApp (Uazapi)**  
   - Em **Configurações**, **substituir** a UI atual de “Conexão WhatsApp” por fluxo de **criação e gestão de caixas de entrada**.  
   - Ao criar/editar uma caixa: **modal** contendo os **mesmos fluxos de conexão** já existentes (instância / QR Code / obter instância já conectada via integração **Leads Infinitos** com token), mais **nome da caixa de entrada** e **seleção do funil vinculado** (obrigatório: **1 funil por caixa**).  
   - **Cardinalidade:** **um funil pode ter várias caixas de entrada**; **cada caixa de entrada tem exatamente um funil**. Várias caixas podem compartilhar o **mesmo** funil — nesse caso, o sistema deve permitir **saber de qual caixa veio cada lead** (campo `inbox_id` ou equivalente, filtros e indicador na UI do Kanban/card).  
8. **Múltiplos funis**: permitir ao **admin** criar **mais de um funil** (definição de funil = conjunto de etapas + board associado, conforme modelo adotado na investigação); **visualizar e CRUD de funis** de outros usuários da organização quando a permissão RBAC permitir (detalhar no Passo 3). **Um funil por caixa de entrada**; múltiplas caixas podem reutilizar o mesmo funil (ver item 7).

**Out of Scope:**

- Redesign completo do Kanban além dos blocos/modais (automação, indicadores de caixa, seletor de funil).
- Motor de automação genérico além da primeira regra (schema pode ser extensível).
- App mobile nativo.
- Substituir a Uazapi por outro provedor WhatsApp (continua **Uazapi**; evolui-se modelo de **inboxes** e webhooks por caixa/instância).

## Context for Development

### Codebase Patterns

- **Auth**: JWT via `get_current_user` (`dependencies.py`); claims básicos do Supabase Auth.
- **Supabase no backend**: `get_supabase()` usa **chave service role** — **RLS ignorado** nas queries da API. Comentário explícito no código: *tenant isolation manual* com `.eq("tenant_id", user.id)` (ou equivalente) em **cada** operação. Qualquer novo modelo (orgs, read_only) deve passar por **camada de autorização na FastAPI** (dependencies ou serviço), não assumir RLS.
- **Kanban hoje**: `GET /api/leads/kanban` lê `pipeline_stages` e `leads` filtrados por `tenant_id == user.id`; agrupa cards por **`leads.stage`** (string) casando com **`pipeline_stages.name`** (case-insensitive). **Um lead = uma linha = um `stage` por tenant.**
- **Mover card**: `PATCH /api/leads/{id}/stage` (`move_lead_stage`) resolve nome canônico da etapa e faz `UPDATE leads SET stage = ...` com `tenant_id = user.id`. Ponto único para **auditoria de movimentação** e para restringir read_only.
- **Etapas**: `POST/PATCH/DELETE /api/leads/stages[...]` — criar/renomear/reordenar colunas; conflito de versão em reorder.
- **Inbound WhatsApp**: `webhook_processor.py` insere em `leads` com `tenant_id`, `stage` inicial, telefone formatado; unique `(tenant_id, whatsapp_chat_id)` (migration 002) — **evoluir** para escopo por **`inbox_id`** quando múltiplas instâncias por tenant.
- **Configurações / WhatsApp (hoje)**: `frontend-next/app/(dashboard)/configuracoes/page.tsx` — modal “Conexão WhatsApp Uazapi” (QR, etc.); backend `routers/whatsapp.py` + `settings` para token de instância.
- **Frontend**: `kanban/page.tsx` chama API via `lib/api`; DnD local + refresh; `NewOrderModal` e outros às vezes usam **Supabase client no browser** (RLS ativo no cliente — hoje policies `auth.uid() = tenant_id` em `leads`/`pipeline_stages`). **Inconsistência**: API bypassa RLS; cliente direto não. Features novas devem alinhar (ou só API, ou policies por org).
- **Produtos / promoções / pedidos**: mesmos routers com `tenant_id = user.id`; read_only precisará bloquear mutações em `products`, `promotions`, `orders`, etc.

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `backend/migrations/001_initial_schema.sql` | `profiles`, `leads`, RLS policies (cliente anon) |
| `backend/migrations/002_unique_whatsapp.sql` | UNIQUE (tenant_id, whatsapp_chat_id) |
| `backend/migrations/003_catalog_promotions_and_stage_reorder.sql` | `pipeline_stages`, RLS em stages/categorias/promoções |
| `backend/migrations/004_inventory_and_catalog_compat.sql` | Colunas extras em `leads` (stock_reserved_json, …) |
| `backend/app/dependencies.py` | JWT + `get_supabase` service role + nota de isolamento manual |
| `backend/app/routers/leads.py` | `get_kanban_board`, `move_lead_stage`, CRUD de stages, `create_lead`, `update_lead` |
| `backend/app/models/lead.py` | `LeadCreate`, `LeadUpdate`, `LeadMoveStage`, `LeadResponse` |
| `backend/app/workers/webhook_processor.py` | Criação de lead inbound Uazapi |
| `frontend-next/app/(dashboard)/kanban/page.tsx` | Kanban UI principal |
| `frontend-next/lib/api.ts` | Wrapper fetch com token (inclui helpers WhatsApp/Uazapi) |
| `frontend-next/app/(dashboard)/configuracoes/page.tsx` | UI atual de conexão WhatsApp — **substituir** por gestão de caixas de entrada |
| `backend/app/routers/whatsapp.py` | Token de instância Uazapi por tenant — **estender** para múltiplas instâncias/inboxes |

### Investigation findings (âncoras para implementação)

| Área | Achado |
| ---- | ------ |
| **Modelo de estágio** | `leads.stage` é texto; estágio “de verdade” para UI vem de `pipeline_stages` por tenant. ADR-001 (`lead_pipeline_positions`) exige **migração** deste acoplamento e ajuste de `get_kanban_board` + `move_lead_stage`. |
| **Automação cross-user** | Hoje não existe join entre tenants; automação precisará **service role** + regras explícitas (org + permissão) para inserir **posicionamento** no board do destino sem duplicar `leads`. |
| **Superadmin seed** | `auth.users` + `profiles`; email fixo — migração SQL (UPDATE) ou script admin Supabase documentado; não há `is_superadmin` no schema atual. |
| **Clientes CRM** | Não há tabela `clients`; hoje cliente ≈ campos em `leads` + `contacts`. Nova entidade + FK opcional `leads.client_id` e resolução no webhook. |
| **Testes** | Não há cobertura automatizada de rotas; adicionar testes de API (pytest + TestClient) recomendado para RBAC e movimentação. |
| **Inboxes / funis** | Hoje não existe entidade “funil” separada do tenant: `pipeline_stages` + `leads` por `user.id`. Requisito novo: entidade **funil** (ou namespace de board), **inboxes** com FK `funnel_id` (1:N da caixa para o funil), **`leads.inbox_id`** quando o funil tiver >1 caixa; webhook deve resolver instância → inbox → funil. |

## Architecture Decision Records (ADR)

Registro de opções debatidas, trade-offs e **decisões recomendadas** (método ADR). Nomes de tabelas e políticas RLS finais ficam para confirmação no Passo 2 (investigação no código/Supabase).

### ADR-001 — Um lead em vários funis / usuários

| Opção | Prós | Contras |
| ----- | ---- | ------- |
| **A. Tabela de posicionamentos** (ex.: `lead_pipeline_positions`: `lead_id`, `owner_user_id` ou escopo de funil, `stage_id`, ordem) | Um único `lead_id`; cada funil tem sua posição; mesmo registro de negócio | Queries Kanban mais agregadas; migração do modelo atual (`leads.stage` legado) |
| **B. Espelhar com segunda linha em `leads`** | Menos tabelas | **Descartada**: conflita com requisito de **mesmo registro**, não duplicar linha |
| **C. Lead único + vínculos de visibilidade/automação** que apontam para o mesmo `lead_id` | Alinha com automação “aparecer no outro funil” | Exige modelo de posição por contexto (cobre-se com **A**) |

**Decisão recomendada:** **`leads` como entidade de negócio única**; **posicionamento por contexto** em tabela filha (nome provisório **`lead_pipeline_positions`**: `lead_id`, contexto de dono do funil — ex. `board_user_id` / `organization_id` conforme investigação — `stage_id`, `sort_order`). Automação **insere ou atualiza** posicionamento no destino referenciando o **mesmo** `lead_id`. Campo `stage` atual em `leads` entra em **migração/deprecação** após backfill.

**Racional:** Mesmo registro visível em dois funis sem duplicar lead; read-only restringe mutações a **rota de movimentação** sobre posicionamento autorizado.

---

### ADR-002 — Hierarquia `organizations` × dados existentes (`tenant_id`)

| Opção | Prós | Contras |
| ----- | ---- | ------- |
| **A. `organization_id` em perfis/dados + RLS por org** | Filtro único por conta | Migração ampla de tabelas que hoje usam `tenant_id` = `user.id` |
| **B. Tenant = organization apenas (substituição total)** | Modelo limpo | Big-bang |
| **C. Híbrido: org + ponte com legado** | Migração gradual | Dupla convenção até cutover |

**Decisão recomendada:** **C (ponte)** — introduzir **`organizations`** e **`organization_members`**; definir na investigação o **mapeamento** do dono de dados legado (`leads.tenant_id` etc.) para a org/admin primário; novas políticas e código devem preferir **`organization_id`** quando aplicável.

**Racional:** Reduz risco de parada; Passo 2 fixa fonte da verdade para `tenant_id` na hierarquia nova.

---

### ADR-003 — Autorização (superadmin / admin / read_only)

| Opção | Prós | Contras |
| ----- | ---- | ------- |
| **A. Claims JWT customizados** | Checagem rápida | Sync com Auth; manutenção de claims |
| **B. Papéis em DB + RLS** | Fonte única; alinhado a Supabase | FastAPI deve replicar regras ou usar service role com disciplina |
| **B + papel em `organization_members`** | Granular por organização | Join em requests |

**Decisão recomendada:** **`organization_members.role`** (admin / read_only) + flag ou tabela para **superadmin** (ex.: `profiles.is_superadmin` ou equivalente restrito); **API FastAPI** como gate principal para mutações; **RLS** reforçando acesso direto ao Postgres (cliente Supabase no browser).

**Racional:** Read-only que só **move estágio** concentra-se em **uma rota** (`PATCH` de posicionamento), auditável e testável.

---

### ADR-004 — Auditoria de movimentação e alterações relevantes

| Opção | Prós | Contras |
| ----- | ---- | ------- |
| **A. Tabela append-only** (ex.: `lead_activity` / `lead_audit_log`) | Consultas simples; mensagem derivada na leitura | Crescimento de volume |
| **B. Event sourcing completo** | Histórico máximo | Desnecessário para MVP |

**Decisão recomendada:** **A** — eventos com `event_type`, `from_stage_id`, `to_stage_id`, `actor_user_id`, `occurred_at` (e metadados mínimos); inserção na mesma transação da movimentação ou via trigger; UI formata relativamente (“hoje”, “ontem”) ou data absoluta.

**Racional:** Atende o requisito de rastreabilidade sem complexidade de replay.

---

### ADR-005 — Caixas de entrada × funis × leads

**Regra de negócio (confirmada):** um **funil** pode ter **várias** caixas de entrada; cada **caixa de entrada** tem **exatamente um** funil.

| Opção | Prós | Contras |
| ----- | ---- | ------- |
| **A. Tabela `inboxes`** (`id`, `tenant_id`/`org_id`, `name`, `uazapi_instance_id` ou credenciais, **`funnel_id` FK**, settings) | Modela cardinalidade 1:N (funil ← caixas); query clara | Migração da config WhatsApp “única” atual |
| **B. Apenas `funnel_id` em settings** | Menos tabelas | Não escala para várias instâncias Uazapi com webhooks distintos |

**Decisão recomendada:** **A** — entidade **`inboxes`** (ou nome equivalente) com **`funnel_id` NOT NULL**; **funis** como entidade própria (ou `funnels` ligando a `pipeline_stages` por `funnel_id` em vez de só `tenant_id`). **`leads`** devem carregar **`inbox_id`** (obrigatório quando o lead entra por WhatsApp; opcional para leads manuais se o produto permitir).

**Racional:** Permite **várias caixas no mesmo funil** com discriminação de origem no card; webhook Uazapi roteia por **instância → inbox → funil**.

---

### Technical Decisions (consolidado pós-ADR + investigação)

- **Organizações**: **`organizations`** + **`organization_members`**; ponte com **`tenant_id` legado** — ver **ADR-002**.
- **Mesmo lead, vários funis**: tabela de **posicionamentos** — ver **ADR-001**; código atual (`leads.stage` + kanban por nome) será substituído/estendido após migração.
- **Autorização na API**: **FastAPI obrigatória** como fonte de verdade para mutações (service role bypassa RLS). Introduzir `Depends(require_role(...))` ou serviço de permissões; **read_only**: bloquear `POST/PUT/PATCH` de lead (exceto `PATCH .../stage` se permitido), bloquear stages CRUD, bloquear produtos/promoções/pedidos mutáveis; **read_only** só acessa dados do **`assigned_funnel_id`** gravado na criação (coluna em `organization_members` ou equivalente).
- **Cliente Supabase no browser**: revisar policies quando `organization_id` existir; evitar vazar dados entre tenants.
- **Auditoria**: append-only — ver **ADR-004**; hook em `move_lead_stage` (e futuros writes).
- **Telefones**: JSONB ou tabelas filhas; normalização no webhook para match.
- **Superadmin**: coluna booleana em `profiles` ou tabela; seed email `augustogumi@gmail.com`.
- **Inboxes e funis**: ver **ADR-005**; UI **Configurações** passa a listar/criar caixas (modal com fluxos Uazapi atuais + nome + funil); **múltiplos funis** exigem modelo de dados e rotas dedicadas (além do kanban “padrão” único por usuário hoje).
- **Deploy**: **Supabase** (DB/Auth) + app em **VPS** via **Dokploy**; variáveis de ambiente e webhooks Uazapi devem documentar **URL pública** do backend na VPS.

## Implementation Plan

### Tasks

#### Convenções (agentes / janela de contexto)

- Cada **sprint** abaixo tem **2 ou 3 tarefas** pequenas que **se complementam** (mesmo tema, encadeamento lógico).
- Um agente pode pegar **um sprint por sessão** sem carregar o épico inteiro.
- Sprints são **sequenciais** (S2 depende de S1, etc.).
- Schema: sempre `backend/migrations/` + execução no **SQL Editor** Supabase (seção [SQL — Supabase](#sql--supabase-sql-editor)).

#### Party Mode — melhorias incorporadas

- Front **Supabase client** vs **API** → **AC11**; backfill **antes** de NOT NULL → **S5**; webhook sem inbox → **AC12**; estoque + read_only → **AC13**; read_only só funil atribuído na criação → **AC15** + coluna/schema em **S4/S13**.

#### Console Admin (superadmin) — integração ao plano (sprints 5–14)

Este plano incorpora o documento complementar **`tech-spec-admin-console-ui-rbac-complemento.md`** (Console Admin em **`/admin`**, acessível só com **`profiles.is_superadmin = true`**). Objetivo: **uma superfície operacional** para o superadmin executar e validar CRUD global (organizações, membros, usuários Auth Admin, funis no contexto tenant, produtos por tenant da org, inboxes via link, clientes CRM, leitura de auditoria quando existir API), **sem substituir** as UIs já planejadas no **Kanban** (automação, seletor de funil, read_only — S11/S13) nem o fluxo **tenant** de **Configurações** (inboxes Uazapi — S8); o console **complementa** com navegação global e **deep links** quando aplicável.

**Regras transversais (aplicam-se a todas as tarefas S\*-UI abaixo):**

1. **Descoberta de superadmin:** o front **não** deve inferir superadmin só por e-mail. Implementar **backend** primeiro: estender **`GET /api/auth/me`** para retornar `is_superadmin` e, se útil, `organization_id` de `profiles` (consulta via service role no handler, usando `user.id` do JWT). Atualizar modelo Pydantic `UserProfile` em `backend/app/models/user.py`.
2. **Navegação:** rota base **`/admin`** com `layout.tsx` dedicado (sidebar **AdminNav**: Organizações, Usuários, Clientes, Produtos, Funis, Links/Inboxes, Ajuda). **Guard:** se `is_superadmin === false`, redirecionar para `/dashboard` ou exibir 403 amigável; tratar **403** das APIs com toast/mensagem (não silêncio).
3. **Chamadas HTTP:** usar **`lib/api.ts`** (`apiGet`, `apiPost`, …) com token `localStorage.getItem("access_token")` — **sem** Supabase client no browser para dados globais sensíveis (**AC11**).
4. **Produtos “por organização”:** o modelo legado amarra produtos a **`tenant_id` = `auth.users.id`**. No console, o fluxo é: selecionar **organização** → listar **membros com `role = admin`** → usar o **`user_id`** desse admin como **tenant** para listar/editar produtos. Se **`GET /api/products` com JWT do superadmin** não retornar dados de outro tenant, implementar **`GET /api/admin/products?tenant_id=<uuid>`** restrito a **`require_superadmin`** (ou equivalente) — tarefa explícita onde marcada.
5. **Funis no console:** após **S5** (funil Default + `funnel_id` backfill), os selects de **`assigned_funnel_id`** (membros read_only e criação de usuário) devem carregar funis do(s) tenant(s) admin da org — dependente de API de listagem de funis por tenant ou endpoint agregador superadmin; até existir, permitir **UUID válido** com validação de erro da API.
6. **Inboxes:** **não** duplicar o modal Uazapi dentro do console; preferir **link visível** “Abrir Configurações — Caixas de entrada” → `/configuracoes` (e, se desejado, query `?from=admin` para mensagem contextual após **S8**).
7. **Rastreabilidade:** manter o arquivo **`tech-spec-admin-console-ui-rbac-complemento.md`** como referência de IA/ACs **AC-UI-01…07**; os **ACs principais** deste documento incluem extensão **AC-UI-\*** na secção [Acceptance Criteria](#acceptance-criteria).

---

#### Sprint 1 — Schema baseline + Supabase (3 tasks)

- [x] **S1-T1:** Criar `backend/migrations/006_rbac_baseline.sql` com DDL da seção SQL (orgs, members, profiles, funnels, inboxes, colunas em leads/stages, `lead_activity`, `crm_clients`, `lead_pipeline_positions` se aplicável).
- [x] **S1-T2:** Rodar no **Supabase SQL Editor** (staging primeiro); validar tabelas no Table Editor.
- [x] **S1-T3:** UPDATE superadmin `augustogumi@gmail.com`; confirmar 1 linha afetada.

#### Sprint 2 — AuthZ mínimo (3 tasks)

- [x] **S2-T1:** `backend/app/authz.py`: `get_effective_role`, `require_superadmin`, `require_org_admin`.
- [x] **S2-T2:** `dependencies.py` + prova em uma rota (200/403).
- [x] **S2-T3:** Primeiro teste `TestClient` ou unit puro de papel.

#### Sprint 3 — Organizações API (3 tasks)

- [x] **S3-T1:** `routers/organizations.py` CRUD org + membros.
- [x] **S3-T2:** `main.py` + Pydantic.
- [x] **S3-T3:** Smoke curl/pytest mínimo documentado.

#### Sprint 4 — Usuários + telefones (3 tasks)

- [x] **S4-T1:** `routers/users.py` + Supabase Admin API só backend; na criação/edição de **read_only**, campo obrigatório **`assigned_funnel_id`** (funil da org sob responsabilidade daquele admin).
- [x] **S4-T2:** Persistir `assigned_funnel_id` em **`organization_members`** (ou equivalente) com CHECK: se `role = read_only` então NOT NULL; se `admin` então NULL. Migração SQL correspondente no Supabase.
- [x] **S4-T3:** Telefones múltiplos (JSONB/tabela); revisar env; teste: criar read_only com funil X e ler perfil com X.

#### Sprint 5 — Funil default + backfill (3 tasks) + Console Admin — fundação

- [x] **S5-T1:** SQL: criar funil “Default” por tenant existente.
- [x] **S5-T2:** Backfill `pipeline_stages.funnel_id` e `leads.funnel_id` (idempotente).
- [x] **S5-T3:** Documentar ordem; **não** NOT NULL em `funnel_id` até 100% backfill.

**Console Admin (integração spec complementar):**

- [x] **S5-UI-1 (backend — pré-requisito do front):** Estender **`GET /api/auth/me`** em `backend/app/routers/auth.py`: após `get_current_user`, consultar `profiles` (`.select("is_superadmin, organization_id")`) e incluir no JSON **`is_superadmin: bool`** e **`organization_id: Optional[str]`**. Atualizar **`UserProfile`** em `backend/app/models/user.py` com esses campos. Garantir que falha na leitura de `profiles` não quebre o login já efetuado — retornar defaults seguros (`is_superadmin=False`).
- [x] **S5-UI-2 (frontend — login):** Em `frontend-next/app/login/page.tsx`, após resposta 200 de **`/api/auth/login`**, chamar **`GET /api/auth/me`** com `Authorization: Bearer <access_token>`. Se **`is_superadmin === true`**, exibir **dois CTAs**: **“Console Admin”** → `router.push("/admin")` e **“Ir para o app”** → `router.push("/dashboard")` (ou fluxo equivalente: banner + botões, sem remover tokens). Se não superadmin, manter comportamento atual (`router.push("/dashboard")` direto).
- [x] **S5-UI-3 (frontend — shell `/admin`):** Criar **`frontend-next/app/(admin)/admin/layout.tsx`**: (1) layout visual alinhado ao tema (glass/primary como login); (2) **guard** client-side: fetch `/api/auth/me` no mount; se `!is_superadmin`, `redirect("/dashboard")` ou página 403; (3) placeholder **AdminNav** (links: Organizações, Usuários, Clientes, Produtos, Funis, Configurações/Inboxes, Ajuda) — destinos podem ser `#` até páginas existirem.
- [x] **S5-UI-4 (frontend — dashboard do console):** **`frontend-next/app/(admin)/admin/page.tsx`**: cards resumo (ex.: total de organizações via **`GET /api/organizations`**), área “Próximos passos” listando dependências (funis pós-backfill, etc.). Tratar loading/erro.
- [x] **S5-UI-5 (frontend — helpers):** Adicionar em **`frontend-next/lib/api.ts`** funções tipadas mínimas: `getAuthMe`, `getOrganizations`, `createOrganization`, `updateOrganization`, `deleteOrganization`, `listOrgMembers`, `addOrgMember`, `updateOrgMember`, `removeOrgMember`, `createUser`, `getUser`, `patchUser` (wrappers alinhados a **`/api/organizations`** e **`/api/users`**) para reutilização no console e no login.
- [x] **S5-UI-6 (frontend — organizações):** **`admin/organizations/page.tsx`**: tabela com **`GET /api/organizations`**; ações **criar** (modal `POST /api/organizations` com nome), **editar** (`PATCH`), **excluir** (`DELETE`) com confirmação; estados vazio/erro/carregando.
- [x] **S5-UI-7 (frontend — detalhe org + membros):** **`admin/organizations/[orgId]/page.tsx`**: cabeçalho com nome da org; tabela de membros via **`GET /api/organizations/{orgId}/members`**; modal **adicionar membro** (`POST .../members`) com `user_id`, `role`, `assigned_funnel_id` obrigatório se `read_only`; ações **editar** / **remover** membro (`PATCH` / `DELETE`). Validação client-side espelhando regras do backend (admin sem funil; read_only com funil). Seleção de funil: dropdown alimentado por lista disponível (stub UUID até **S6-UI-2**).
- [x] **S5-UI-8 (frontend — usuários Auth Admin):** **`admin/users/page.tsx`**: fluxo **escolher organização** (select das orgs listadas) + formulário **`POST /api/users`** com campos: `organization_id`, `email`, `password`, `full_name`, `company_name`, `phones[]`, `role`, `assigned_funnel_id` (obrigatório se read_only); máscara ou tags para múltiplos telefones. **`admin/users/[userId]/page.tsx`**: **`GET /api/users/{id}`** com exibição de perfil + memberships; **`PATCH`** com query `organization_id` quando aplicável.

#### Sprint 6 — Kanban por funil (3 tasks) + Console Admin — funis e smoke com API

- [x] **S6-T1:** `GET /api/leads/kanban?funnel_id=` opcional; default = funil default do tenant; se usuário for **read_only**, **ignorar** query e forçar **`assigned_funnel_id`** (403 se funil inválido ou não atribuído).
- [x] **S6-T2:** Colunas só com estágios daquele funil.
- [x] **S6-T3:** Teste manual: admin com dois funis; read_only só recebe dados do funil atribuído.

**Console Admin:**

- [x] **S6-UI-0 (backend — recomendado para produtos no console):** Implementar **`GET /api/admin/products?tenant_id=<uuid>`** (ou nome equivalente) restrito a **`require_superadmin`**, retornando produtos onde `products.tenant_id = tenant_id`. Documentar em OpenAPI/docstring. Alternativa temporária: documentar no console que superadmin deve usar tenant JWT — **não ideal** para AC operacional.
- [x] **S6-UI-1:** Se existir endpoint de listagem de funis por tenant (ou agregação para superadmin), adicionar **`admin/funnels/page.tsx`** com tabela somente leitura ou CRUD mínimo conforme API disponível. Caso ainda não exista router dedicado, manter **página stub** explicando dependência (“Implementar `GET /api/funnels` ou uso de query no router de leads”) e link para documentação interna.
- [x] **S6-UI-2:** Na página **detalhe da organização** (preparada em S5-UI ou expandida aqui), seção **“Funis”**: exibir funis cujo `tenant_id` pertença a **membros admin** da org (mesma regra de `app/org_scope.py` no backend, espelhada em chamadas ou endpoint admin). Dropdowns de **`assigned_funnel_id`** no console devem consumir essa lista quando possível.
- [x] **S6-UI-3 (opcional):** Link **“Abrir Kanban neste funil”** que navega para `/kanban?funnel_id=...` quando a UI principal suportar query (alinhado a **S13**).
- [x] **S6-UI-4 (frontend — produtos por tenant):** **`admin/products/page.tsx`**: (1) select **Organização** → (2) select **Tenant (membro admin)** derivado de **`GET .../organizations/{id}/members`** filtrando `role === 'admin'`; (3) chamar **`GET /api/admin/products?tenant_id=...`** (**S6-UI-0**) ou fallback documentado; (4) tabela read-only ou CRUD espelhando **`/produtos`** do app quando políticas de superadmin permitirem edição — caso contrário, somente leitura até definição de produto.

#### Sprint 7 — Inboxes API + WhatsApp por caixa (3 tasks) + Console Admin — inboxes na API client

- [x] **S7-T1:** CRUD `inboxes`; validar 1 funil/caixa.
- [x] **S7-T2:** `whatsapp.py` escopado por `inbox_id`.
- [x] **S7-T3:** `lib/api.ts` endpoints inbox.

**Console Admin:**

- [x] **S7-UI-1:** Em **`lib/api.ts`**, expor **`listInboxes`**, **`createInbox`**, **`updateInbox`**, **`deleteInbox`** (nomes alinhados ao router real) para uso tanto de **S8** quanto do console.
- [x] **S7-UI-2:** No **`layout`** ou página **“Links”** do admin, card **“Caixas de entrada (Uazapi)”**: texto explicando que o fluxo completo (QR, instância, Leads Infinitos) fica em **Configurações**; botão **“Ir para Configurações”** → `/configuracoes` (opcional `?from=admin`). Opcionalmente, **tabela somente leitura** de inboxes via API nova se superadmin tiver permissão nas rotas (confirmar backend); se não, apenas link.
- [x] **S7-UI-3:** Garantir que nenhuma chamada do console use **service role** no browser — apenas JWT do usuário superadmin.

#### Sprint 8 — UI Configurações caixas (3 tasks) + Console Admin — deep link e paridade

- [ ] **S8-T1:** `configuracoes/page.tsx`: lista + modal (QR / instância / Leads Infinitos + nome + funil).
- [ ] **S8-T2:** Retirar fluxo WhatsApp único legado.
- [ ] **S8-T3:** Smoke: 2 inboxes no mesmo funil.

**Console Admin:**

- [ ] **S8-UI-1:** Em **`configuracoes/page.tsx`**, se `searchParams.from === 'admin'` (ou equivalente), exibir **banner** “Voltar ao Console Admin” → `/admin`.
- [ ] **S8-UI-2:** No console, repetir **smoke S8-T3** do ponto de vista superadmin: após criar 2 inboxes no mesmo funil, verificar no Kanban (quando S13 pronto) ou via API que **inbox_id** distingue origem — checklist manual cruzado com **AC6**.
- [ ] **S8-UI-3:** Documentar em **Ajuda** do console (página estática ou markdown inline) o fluxo **Configurações ↔ Console** para operadores.

#### Sprint 9 — Webhook + UNIQUE + cliente (3 tasks) + Console Admin — observabilidade leve

- [ ] **S9-T1:** `webhook_processor.py`: instância → inbox; se não resolver, **log + saída sem lead órfão** (**AC12**).
- [ ] **S9-T2:** Migração UNIQUE `(inbox_id, whatsapp_chat_id)` + estratégia legado `inbox_id` null.
- [ ] **S9-T3:** Resolver/criar `crm_client` por telefone ao criar lead.

**Console Admin:**

- [ ] **S9-UI-1 (opcional):** Se existir endpoint de **logs** ou **health** do worker, card no dashboard `/admin` com link externo ou texto “ver logs no Dokploy/VPS” (**S14**). Se não existir API, **placeholder** “Diagnóstico via infra” — sem bloquear release.
- [ ] **S9-UI-2:** Texto de ajuda no console explicando que **leads sem inbox resolvido** não devem ser criados (**AC12**) e onde verificar logs.

#### Sprint 10 — CRM clients CRUD + máscaras (3 tasks) + Console Admin — CRM completo

- [ ] **S10-T1:** `clients.py` + validação CPF/CNPJ server-side.
- [ ] **S10-T2:** Front máscaras PF/PJ + endereço.
- [ ] **S10-T3:** Teste 422 CNPJ inválido.

**Console Admin:**

- [ ] **S10-UI-1:** Implementar **`frontend-next/app/(admin)/admin/clientes/page.tsx`** (ou rota equivalente): **listagem** com filtros (tenant/org), **criar/editar/excluir** chamando as rotas **`/api/...`** do router de clientes; reutilizar **máscaras e validação** da mesma base que **S10-T2** (componentes compartilhados em `components/` para não duplicar lógica).
- [ ] **S10-UI-2:** Formulário com campos do modelo **`crm_clients`** (PF/PJ, CPF/CNPJ, endereço, flags **sem número** / **rua sem saída**, **phones** JSONB). Exibir erros **422** da API de forma legível (AC9).
- [ ] **S10-UI-3:** Até **S10-T1** existir, manter **placeholder** explícito (conforme spec complementar **AC-UI-06**) — sem tela em branco.

#### Sprint 11 — Posições + automação + auditoria (3 tasks) + Console Admin — leitura / links

- [ ] **S11-T1:** `lead_pipeline_positions` + `move_lead_stage` (ADR-001).
- [ ] **S11-T2:** `stage_automations` + UI “Automação” no Kanban.
- [ ] **S11-T3:** `lead_activity` insert + timeline no card.

**Console Admin:**

- [ ] **S11-UI-1:** Página **“Automação / Auditoria”** no admin: **prioridade** — links para documentação e para **Kanban** (onde a automação é configurada — **S11-T2**). **Se** existir **`GET /api/.../lead_activity`** ou listagem por `lead_id`, tabela somente leitura com paginação; caso contrário, stub com dependência explícita.
- [ ] **S11-UI-2:** Não reimplementar o **modal de automação** do Kanban no console — evitar duplicação; o console é **hub** operacional, não segundo editor de regras, salvo decisão de produto futura.

#### Sprint 12 — Read-only + regressão estoque (3 tasks) + Console Admin — segurança

- [ ] **S12-T1:** `require_role` em produtos, promoções, leads (exceto PATCH stage), stages.
- [ ] **S12-T2:** Teste: read_only PATCH produtos no lead → 403; admin OK; **estoque** consistente (**AC13**).
- [ ] **S12-T3:** Documentar rotas legacy.

**Console Admin:**

- [ ] **S12-UI-1:** Verificar manualmente que **nenhuma** rota do console chama mutações “como outro usuário” sem backend permitir; superadmin só usa endpoints já protegidos (**AC1**).
- [ ] **S12-UI-2:** Se existir **lista de usuários** no console, exibir **papel** (admin/read_only) e **não** oferecer ações que o backend negaria para não-superadmin ao testar com usuário errado.
- [ ] **S12-UI-3:** Teste manual: usuário **sem** superadmin acessa `/admin` → bloqueio (**AC-UI-02**).

#### Sprint 13 — Kanban UI funil + inbox + read_only (3 tasks) + Console Admin — entrada global

- [ ] **S13-T1:** **Admin:** seletor de funil + badge inbox se >1 caixa no funil. **Read_only:** **sem** seletor de funil; board fixo no funil atribuído.
- [ ] **S13-T2:** Desabilitar criar/editar card e etapas para read_only.
- [ ] **S13-T3:** Garantir que nenhuma rota/front permita read_only “trocar” de funil (URL com `funnel_id` diferente → 403 ou redirect seguro).

**Console Admin:**

- [ ] **S13-UI-1:** Em **`frontend-next/components/sidebar.tsx`** (ou menu principal do dashboard), exibir link **“Console Admin”** **apenas** quando `is_superadmin` (obtido via hook/context que chama `/api/auth/me` uma vez por sessão ou cache). Ícone discreto (ex.: **shield / admin_panel_settings**).
- [ ] **S13-UI-2:** Garantir **paridade**: superadmin consegue ir ao Kanban normal e ao console sem conflito de estado (tokens únicos).
- [ ] **S13-UI-3:** Validar **AC15** no Kanban para read_only; o console **não** substitui essa validação — apenas documentação cruzada na ajuda do admin.

#### Sprint 14 — Front API + deploy (3 tasks) + Console Admin — endurecimento e docs

- [ ] **S14-T1:** Migrar inserts diretos (`NewOrderModal` etc.) para API ou RLS (**AC11**).
- [ ] **S14-T2:** Doc Dokploy/VPS + webhook Uazapi.
- [ ] **S14-T3:** Checklist pós-deploy manual.

**Console Admin:**

- [ ] **S14-UI-1:** Auditar **todas** as páginas sob `/admin` e garantir **zero** uso de `createClient` Supabase no browser para dados mutáveis; apenas **`lib/api.ts`** (**AC11** + **AC-UI**).
- [ ] **S14-UI-2:** README ou doc em `_bmad-output` ou `docs/`: **como acessar o Console Admin**, variável **`NEXT_PUBLIC_API_URL`**, e smoke **superadmin vs não-superadmin**.
- [ ] **S14-UI-3:** Checklist pós-deploy inclui item **“Login superadmin → Console Admin → CRUD organização de teste”**.

---

**Mapa rápido (sprint → foco):** S1 DB · S2 authz · S3 orgs · S4 users · **S5 backfill funil + Console Admin fundação (`/me`, login, shell `/admin`)** · S6 kanban API + admin funis · S7 inboxes API + client inbox link · S8 UI config + deep link admin · S9 webhook + ajuda diagnóstico · **S10 CRM + admin clientes** · S11 automação/audit + admin leitura · S12 RBAC + admin segurança · **S13 kanban UI + sidebar Admin** · **S14 hardening + doc admin**.

### Acceptance Criteria

- [ ] **AC1:** Dado usuário **superadmin** autenticado, quando chamar endpoints de gestão global de orgs/usuários, então operações são permitidas; dado usuário sem superadmin, então recebe 403.
- [ ] **AC2:** Dado **admin de organização**, quando criar usuário **read_only** **com funil atribuído obrigatório**, então o usuário não consegue `POST/PATCH` em leads (exceto movimentação), stages, produtos, promoções; consegue `GET` e abrir card de chat **apenas** no funil atribuído.
- [ ] **AC3:** Dado usuário **read_only**, quando **mover** card entre etapas via rota permitida, então movimentação persiste e **linha de auditoria** é criada com ator, etapa origem/destino e timestamp.
- [ ] **AC4:** Dado lead existente, quando usuário read_only tentar editar **campos do card** (nome, valor, produtos), então 403.
- [ ] **AC5:** Dado **nova conversa** WhatsApp numa **inbox** com `funnel_id` F, quando webhook processar, então lead é criado com `inbox_id`, `funnel_id` F e **cliente** resolvido/criado por telefone normalizado.
- [ ] **AC6:** Dado **duas inboxes** no **mesmo funil**, quando leads entrarem por cada caixa, então ambos aparecem no mesmo board e cada card mostra **qual inbox** originou (filtro ou badge).
- [ ] **AC7:** Dado criação de **inbox**, quando não selecionar funil, então validação impede salvar (1 funil obrigatório por caixa).
- [ ] **AC8:** Dado **automação** configurada da etapa A para etapa B (outro usuário), quando mover lead para A, então o **mesmo** `lead_id` fica visível/posicionado em B conforme regra (sem segunda linha de negócio duplicada).
- [ ] **AC9:** Dado cliente CRM **PJ**, quando salvar CNPJ inválido, então validação rejeita; CNPJ válido com máscara aceito.
- [ ] **AC10:** Dado **SQL** da migração, quando executar no **Supabase SQL Editor**, então roda sem erro e tabelas/colunas aparecem no schema `public` (verificar com query de catálogo ou UI Table Editor).
- [ ] **AC11 (Party Mode):** Dado **mutação de dados** que hoje usa **Supabase client no browser**, quando a feature org/RBAC estiver ativa, então **ou** a mutação passa pela **API FastAPI** com JWT **ou** as **RLS policies** cobrem org — sem criar lead/stage por usuário errado.
- [ ] **AC12 (Party Mode):** Dado evento **Uazapi** sem **inbox** resolvível, quando o worker processar, então **não** cria lead sem `inbox_id`/`funnel_id` válidos; registra **erro estruturado** (log/telemetria) para diagnóstico.
- [ ] **AC13 (Party Mode):** Dado **read_only** e **admin** alterando `products_json` em lead, quando aplicar regras RBAC, então read_only recebe **403** e **reserva de estoque** permanece consistente para admin (teste de regressão `_compute_stock_delta`).
- [ ] **AC14:** Dado **backfill** de `funnel_id`, quando consultar `pipeline_stages`/`leads`, então **nenhum** registro de produção fica com `funnel_id` NULL após migração completa (ou exceção documentada e fila de correção).
- [ ] **AC15:** Dado usuário **read_only** com **funil atribuído** F na criação, quando chamar Kanban ou APIs escopadas por funil com `funnel_id` **diferente** de F (ou tentar listar outro funil), então **403** ou dados apenas de F; **não** exibe seletor de funil na UI para read_only.

**Console Admin (spec complementar — critérios alinhados aos sprints S5-UI … S14-UI):**

- [ ] **AC-UI-01:** Dado usuário com **`is_superadmin = true`** retornado por **`GET /api/auth/me`**, quando completar login, então consegue ver entrada **“Console Admin”** e ao navegar para **`/admin`** obtém 200 (layout), não 403 do front guard.
- [ ] **AC-UI-02:** Dado usuário **sem** superadmin, quando acessar **`/admin`** pela URL, então é redirecionado para **`/dashboard`** ou vê página 403 amigável.
- [ ] **AC-UI-03:** Dado superadmin no console, quando usar **Organizações**, então lista e mutações refletem **`GET/POST/PATCH/DELETE /api/organizations`** com respostas corretas.
- [ ] **AC-UI-04:** Dado superadmin ao adicionar membro **read_only** sem **assigned_funnel_id**, então o formulário bloqueia envio e/ou API retorna **422**.
- [ ] **AC-UI-05:** Dado superadmin ao criar usuário via **`POST /api/users`** com telefones e funil, então **`GET /api/users/{id}`** exibe os mesmos dados de telefone e funil na membership.
- [ ] **AC-UI-06:** Dado API de clientes ainda indisponível, quando abrir seção **Clientes** no console, então vê mensagem explícita de dependência (não tela branca).
- [ ] **AC-UI-07:** Dado superadmin na seção **Produtos** com **S6-UI-0** implementado, quando selecionar **tenant** (admin da org), então lista de produtos corresponde a esse tenant.

## Additional Context

### Dependencies

- **Supabase** (Postgres + Auth); Auth Admin API para superadmin (service role no backend, nunca no browser).
- **Dokploy** na **VPS** para orquestrar deploy da stack (backend, frontend, worker, Redis conforme compose atual).
- **Uazapi** — API não oficial WhatsApp; webhooks devem continuar a apontar para o endpoint público do backend na VPS.
- Migrações SQL versionadas em `backend/migrations/` e **cópia executável no Supabase** (ver seção abaixo).

### SQL — Supabase (SQL Editor)

**Requisito de entrega:** para cada mudança de schema, o implementador deve (1) versionar em `backend/migrations/`, (2) **colar e executar** o mesmo script (ou parte ordenada) no **SQL Editor** do projeto Supabase (Dashboard → SQL → New query). Testar primeiro em projeto de **staging**, se existir.

**Script base (rascunho — revisar FKs e UNIQUE antes de produção):**

```sql
-- =============================================================================
-- Neurix — RBAC, orgs, funis, inboxes, auditoria, clientes (BASELINE)
-- Executar no Supabase SQL Editor como um bloco ou dividir por fases.
-- Ajustar nomes/números de migration para não colidir com arquivos existentes.
-- =============================================================================

BEGIN;

-- ORGANIZAÇÕES E MEMBROS
CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.organization_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('admin', 'read_only')),
    -- read_only: obrigatório após existir tabela funnels; FK adicionada em migração que cria funnels
    assigned_funnel_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_members_user ON public.organization_members(user_id);

-- PERFIS: superadmin + vínculo opcional à org
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS is_superadmin BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;

-- FUNIS (board lógico; pipeline_stages passa a referenciar funnel_id em migração posterior)
CREATE TABLE IF NOT EXISTS public.funnels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_funnels_tenant ON public.funnels(tenant_id);

-- Opcional na mesma transação, após funnels existir:
-- ALTER TABLE public.organization_members
--   ADD CONSTRAINT organization_members_assigned_funnel_fkey
--   FOREIGN KEY (assigned_funnel_id) REFERENCES public.funnels(id) ON DELETE SET NULL;

-- CAIXAS DE ENTRADA (1 funil por caixa; N caixas por funil permitido)
CREATE TABLE IF NOT EXISTS public.inboxes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    funnel_id UUID NOT NULL REFERENCES public.funnels(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    -- credenciais Uazapi: preferir tabela settings namespaced ou vault; placeholder:
    uazapi_settings JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inboxes_funnel ON public.inboxes(funnel_id);
CREATE INDEX IF NOT EXISTS idx_inboxes_tenant ON public.inboxes(tenant_id);

-- LEADS: origem de inbox / funil
ALTER TABLE public.leads
    ADD COLUMN IF NOT EXISTS inbox_id UUID REFERENCES public.inboxes(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS funnel_id UUID REFERENCES public.funnels(id) ON DELETE SET NULL;

-- ETAPAS: associação ao funil (backfill obrigatório antes de NOT NULL em produção)
ALTER TABLE public.pipeline_stages
    ADD COLUMN IF NOT EXISTS funnel_id UUID REFERENCES public.funnels(id) ON DELETE CASCADE;

-- AUDITORIA DE MOVIMENTAÇÃO
CREATE TABLE IF NOT EXISTS public.lead_activity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    from_stage_id UUID REFERENCES public.pipeline_stages(id) ON DELETE SET NULL,
    to_stage_id UUID REFERENCES public.pipeline_stages(id) ON DELETE SET NULL,
    actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_lead_activity_lead ON public.lead_activity(lead_id, occurred_at DESC);

-- CLIENTES CRM
CREATE TABLE IF NOT EXISTS public.crm_clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    person_type TEXT NOT NULL CHECK (person_type IN ('PF', 'PJ')),
    cpf TEXT,
    cnpj TEXT,
    display_name TEXT NOT NULL,
    contact_name TEXT,
    phones JSONB NOT NULL DEFAULT '[]'::jsonb,
    address_line1 TEXT,
    address_line2 TEXT,
    neighborhood TEXT,
    postal_code TEXT,
    city TEXT,
    state TEXT,
    complement TEXT,
    no_number BOOLEAN DEFAULT false,
    dead_end_street BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_clients_tenant ON public.crm_clients(tenant_id);

ALTER TABLE public.leads
    ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.crm_clients(id) ON DELETE SET NULL;

-- POSICIONAMENTO MULTI-FUNIL (ADR-001) — opcional na mesma migração ou fase 2
CREATE TABLE IF NOT EXISTS public.lead_pipeline_positions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    funnel_id UUID NOT NULL REFERENCES public.funnels(id) ON DELETE CASCADE,
    stage_id UUID NOT NULL REFERENCES public.pipeline_stages(id) ON DELETE CASCADE,
    board_owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    UNIQUE (lead_id, funnel_id, board_owner_user_id)
);

-- SUPERADMIN SEED (ajustar email se necessário)
UPDATE public.profiles p
SET is_superadmin = true
FROM auth.users u
WHERE u.id = p.id
  AND lower(u.email) = lower('augustogumi@gmail.com');

COMMIT;
```

**Pós-execução:** criar funis default e backfill `pipeline_stages.funnel_id` / `leads.funnel_id` via script adicional (Task 6); revisar **UNIQUE** `leads_tenant_id_whatsapp_chat_id` para cenário multi-inbox (substituir por unique parcial ou `(inbox_id, whatsapp_chat_id)`).

### Testing Strategy

- **Unitário:** `promotion_engine` e helpers de normalização de telefone; regras de `authz` (papéis).
- **Integração API:** pytest + `TestClient` — rotas de movimentação com read_only; 403 em mutações proibidas; criação de inbox com funil.
- **Manual:** fluxo Configurações → nova caixa → QR; webhook de teste; Kanban com duas inboxes no mesmo funil; automação cross-user.
- **Console Admin (superadmin):** smoke **AC-UI-01–07** após implementação das tarefas **S5-UI** em diante; login com conta não-superadmin não deve persistir em `/admin`.
- **Supabase:** validar RLS nas tabelas novas se o front continuar com client anon; caso contrário documentar “API only”.

### Notes

**Respostas do produto (2026-03-26):**

1. **Organizações**: Nova entidade **`organizations`** com **N usuários**.
2. **Automação / funis**: **Mesmo registro** visível em ambos os funis; **atualização automática** (não é cópia independente).
3. **Somente leitura**: Modo definido **na criação do usuário** pelo admin; aplica-se a usuários de **baixa hierarquia**. Pode **mover cards entre etapas** e abrir cards; **não** cria nem edita etapas nem cards (inclui não editar dados do card além do permitido — apenas movimentação conforme regra). **Registrar alterações** em log com texto útil (ex.: “Usuário X moveu o card da etapa A para a etapa B às 16:53” com data relativa ou absoluta).
4. **Inboxes / funis (2026-03-26):** substituir config WhatsApp por **caixas de entrada**; modal com ações atuais (instância, QR, Leads Infinitos/token) + nome + **um funil por caixa**; **várias caixas por funil** permitidas — **obrigatório** distinguir no card/lead a **caixa de origem**. **Múltiplos funis** + CRUD conforme RBAC. Stack: **Supabase + VPS + Dokploy + Uazapi**.
5. **Supabase:** cada migração aplicada no repositório deve ter **comando SQL correspondente** executado no **SQL Editor** (ou CLI) do projeto — ver seção **SQL — Supabase**.

**Riscos / limitações:** migração grande em produção exige janela e backup; `lead_pipeline_positions` + backfill de funil default podem exigir **múltiplos scripts** numerados; validar constraints UNIQUE de WhatsApp após multi-inbox.

**Decisão de produto (fechada):** usuário **read_only** vê **somente o funil atribuído pelo admin na criação** (`assigned_funnel_id`); não há visão de outros funis da org nem troca de funil na UI. Implementação: coluna em **`organization_members`** (ou tabela equivalente) + enforcement na API e no front (**S4**, **S6**, **S13**).

---

## Advanced Elicitation (sessão anterior)

- **Aplicado e aceito:** método **1 — Architecture Decision Records** (seção **Architecture Decision Records (ADR)**).

---

## Quick-spec — workflow concluído

**Status:** `ready-for-dev` · **Passos:** 1–4 completos.

Para implementar numa **sessão nova** (recomendado), use o arquivo final abaixo como única fonte de verdade.

---

### Próximos passos (opcional)

- Revisão adversarial da spec antes do código (recomendação BMAD).
- Implementação: apontar o agente de dev para o arquivo `tech-spec-rbac-hierarquia-clientes-automacao-funil.md`.
