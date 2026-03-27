"use client";

export default function AdminHelpPage() {
    return (
        <div className="max-w-2xl space-y-6 text-sm text-text-secondary-light">
            <h1 className="text-2xl font-bold font-display text-text-main-light dark:text-text-main-dark">Ajuda</h1>

            <section className="space-y-2">
                <h2 className="text-base font-semibold text-text-main-light dark:text-text-main-dark">
                    Console Admin e app tenant
                </h2>
                <ul className="list-disc list-inside space-y-2">
                    <li>
                        <strong>Superadmin:</strong> após o login, escolha &quot;Console Admin&quot; ou &quot;Ir para o
                        app&quot;.
                    </li>
                    <li>
                        Organizações e usuários usam apenas a API FastAPI com JWT — sem service role no navegador
                        (AC11).
                    </li>
                    <li>Migração 008: funil Default + backfill de funnel_id no Supabase antes de operar funis em produção.</li>
                </ul>
            </section>

            <section className="space-y-2 rounded-xl border border-border-light dark:border-border-dark bg-black/[0.02] dark:bg-white/[0.03] p-4">
                <h2 className="text-base font-semibold text-text-main-light dark:text-text-main-dark">
                    Configurações ↔ Console (Sprint 8)
                </h2>
                <p>
                    O fluxo completo de <strong>caixas de entrada WhatsApp (Uazapi)</strong> — nome da caixa, escolha do
                    funil obrigatória, QR Code, token manual / Leads Infinitos — fica em{" "}
                    <strong>Configurações</strong> no app principal (<code className="text-xs bg-black/5 dark:bg-white/10 px-1 rounded">/configuracoes</code>
                    ).
                </p>
                <p>
                    No Console Admin, use <strong>Links / Caixas</strong> para abrir o app com contexto:{" "}
                    <code className="text-xs bg-black/5 dark:bg-white/10 px-1 rounded">/configuracoes?from=admin</code>{" "}
                    exibe o banner &quot;Voltar ao Console Admin&quot;.
                </p>
                <p>
                    Superadmin pode listar caixas por tenant em <strong>Caixas (somente leitura)</strong> via API; criação
                    e conexão permanecem no tenant (evita duplicar o modal Uazapi no console).
                </p>
            </section>

            <section className="space-y-2 rounded-xl border border-border-light dark:border-border-dark bg-black/[0.02] dark:bg-white/[0.03] p-4">
                <h2 className="text-base font-semibold text-text-main-light dark:text-text-main-dark">
                    Webhooks sem inbox e logs (AC12 — Sprint 9)
                </h2>
                <p>
                    O worker de WhatsApp <strong>só cria lead novo</strong> quando consegue resolver a{" "}
                    <strong>caixa de entrada (inbox)</strong> pelo token da instância Uazapi em{" "}
                    <code className="text-xs bg-black/5 dark:bg-white/10 px-1 rounded">inboxes.uazapi_settings</code>.
                    Se o evento não tiver token ou não corresponder a nenhuma caixa, <strong>nenhum lead é criado</strong>{" "}
                    sem <code className="text-xs bg-black/5 px-1 rounded">inbox_id</code> e{" "}
                    <code className="text-xs bg-black/5 px-1 rounded">funnel_id</code> — é registrado um{" "}
                    <strong>erro JSON estruturado</strong> na fila Redis{" "}
                    <code className="text-xs bg-black/5 px-1 rounded">neurix:webhook_errors</code> e no stdout do worker.
                </p>
                <p>
                    Operadores: configure sempre uma caixa em <strong>Configurações</strong> e associe o token da
                    instância; em caso de falha, verifique logs no Dokploy/VPS ou no Redis acima.
                </p>
            </section>

            <section className="space-y-2 rounded-xl border border-border-light dark:border-border-dark bg-black/[0.02] dark:bg-white/[0.03] p-4">
                <h2 className="text-base font-semibold text-text-main-light dark:text-text-main-dark">
                    Segurança do console e RBAC (Sprint 12)
                </h2>
                <p>
                    O console só chama a API com o <strong>JWT do superadmin logado</strong>. Não há service role nem mutações
                    &quot;em nome&quot; de outro usuário sem endpoints dedicados no backend (AC1 / S12-UI-1).
                </p>
                <p>
                    Usuários <strong>read_only</strong> recebem <strong>403</strong> em POST/PATCH/DELETE de produtos,
                    promoções e leads (exceto <code className="text-xs bg-black/5 px-1 rounded">PATCH …/stage</code>), para
                    preservar estoque e dados do card (AC13).
                </p>
                <p>
                    Para validar <strong>AC-UI-02</strong>: abra <code className="text-xs bg-black/5 px-1 rounded">/admin</code> com
                    uma conta <em>sem</em> superadmin — o layout deve redirecionar para o dashboard.
                </p>
            </section>

            <section className="space-y-2">
                <h2 className="text-base font-semibold text-text-main-light dark:text-text-main-dark">
                    Smoke: duas caixas no mesmo funil (AC6)
                </h2>
                <ol className="list-decimal list-inside space-y-1">
                    <li>Faça login como <strong>admin do tenant</strong> (não read_only).</li>
                    <li>
                        Em Configurações, crie <strong>duas caixas</strong> com o <strong>mesmo funil</strong> (nomes
                        distintos).
                    </li>
                    <li>
                        Opcional: conecte Uazapi em cada caixa (instâncias/tokens diferentes) ou valide só a criação via{" "}
                        <code className="text-xs bg-black/5 px-1 rounded">GET /api/inboxes/</code> — ambas com o mesmo{" "}
                        <code className="text-xs bg-black/5 px-1 rounded">funnel_id</code>.
                    </li>
                    <li>
                        No superadmin: <code className="text-xs bg-black/5 px-1 rounded">GET /api/admin/inboxes?tenant_id=…</code>{" "}
                        deve listar as duas linhas com o mesmo funil.
                    </li>
                    <li>
                        No Kanban: com duas caixas no mesmo funil, use o filtro <strong>Caixa</strong> e os badges nos cards
                        (nome da caixa) para distinguir a origem (AC6).
                    </li>
                </ol>
            </section>

            <section className="space-y-2 rounded-xl border border-border-light dark:border-border-dark bg-black/[0.02] dark:bg-white/[0.03] p-4">
                <h2 className="text-base font-semibold text-text-main-light dark:text-text-main-dark">
                    Read-only e funil fixo (AC15 — Sprint 13)
                </h2>
                <p>
                    Usuários <strong>read_only</strong> não veem o seletor de funil no Kanban; o board usa apenas o{" "}
                    <code className="text-xs bg-black/5 dark:bg-white/10 px-1 rounded">assigned_funnel_id</code> definido na
                    criação. A API retorna <strong>403</strong> se <code className="text-xs bg-black/5 px-1 rounded">GET /api/leads/kanban?funnel_id=</code> for
                    diferente do funil atribuído. O app remove query inválida e exibe o aviso &quot;Somente leitura — funil fixo&quot;.
                </p>
                <p className="text-xs text-text-secondary-light">
                    Esta validação é feita no app tenant (Kanban), não no Console Admin — o console não substitui essa regra
                    (S13-UI-3).
                </p>
            </section>
        </div>
    );
}
