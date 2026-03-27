# RBAC Sprint 12 — rotas legadas e `require_org_admin`

## O que mudou

Mutações em **produtos** (`POST`/`PATCH`/`DELETE` em `/api/products/...`), **promoções** (`POST`/`PATCH`/`DELETE`/`PUT .../products` em `/api/promotions/...`) e **leads** (criar/atualizar/excluir lead; CRUD de etapas; **não** `PATCH /api/leads/{id}/stage`) passam a depender de `require_org_admin` em `app/authz.py`.

Usuários com `organization_members.role = read_only` **não** são `is_org_admin` e recebem **403** com mensagem *Acesso restrito a administrador da organização.*

## Legado sem `organization_members`

Perfis com `profiles.role = admin` e **sem** linha em `organization_members` continuam tratados como administrador do tenant (`EffectiveRole.is_org_admin` é verdadeiro). Essas contas mantêm mutações nas rotas acima como antes da hierarquia por organização.

## Movimentação de card (exceção)

`PATCH /api/leads/{lead_id}/stage` **não** usa `require_org_admin`: `read_only` pode mover estágio no funil atribuído (regras de funil em `get_kanban_board` / `_resolve_kanban_scope`).

## Referência rápida

| Área | Leitura (GET) | Mutação |
|------|----------------|---------|
| Produtos | Qualquer usuário autenticado no tenant | Só org admin / legado admin |
| Promoções | Idem | Idem |
| Leads / estágios | Idem | Idem; estágio do card só via `PATCH .../stage` para read_only |

Documento alinhado ao Sprint 12 (`S12-T3`) do tech-spec `tech-spec-rbac-hierarquia-clientes-automacao-funil.md`.
