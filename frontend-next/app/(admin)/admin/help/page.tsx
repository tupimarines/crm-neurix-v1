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
                        O distintivo visual de origem no Kanban (badge / filtro por inbox) é coberto no{" "}
                        <strong>Sprint 13</strong>; até lá, a distinção está no modelo (<code className="text-xs bg-black/5 px-1 rounded">inbox_id</code>
                        ) e na API.
                    </li>
                </ol>
            </section>
        </div>
    );
}
