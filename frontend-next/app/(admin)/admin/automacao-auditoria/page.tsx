"use client";

import Link from "next/link";

export default function AutomacaoAuditoriaPage() {
    return (
        <div className="relative z-10 max-w-3xl mx-auto p-6 space-y-6">
            <h1 className="text-2xl font-bold font-display">Automação e auditoria</h1>
            <p className="text-sm text-text-secondary-light dark:text-text-secondary-dark">
                As regras de automação por etapa são configuradas no Kanban do app (cada coluna tem o botão &quot;Automação&quot;).
                O console admin não duplica o editor de regras — use os links abaixo para operar e validar.
            </p>
            <ul className="list-disc list-inside text-sm space-y-3 text-text-main-light dark:text-text-main-dark">
                <li>
                    <Link href="/kanban" className="text-primary hover:underline font-medium">
                        Abrir Kanban
                    </Link>{" "}
                    — ao mover ou criar um card na etapa de origem, o mesmo lead pode aparecer também no funil/etapa do outro
                    usuário da organização (visão dupla).
                </li>
                <li>
                    O histórico de movimentações fica no modal <strong>Editar negócio</strong> do card, na seção &quot;Histórico
                    (movimentações)&quot;.
                </li>
                <li>
                    API de auditoria (somente leitura):{" "}
                    <code className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-xs">
                        GET /api/leads/&lt;lead_id&gt;/activity
                    </code>{" "}
                    — eventos como <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded text-xs">stage_move</code> com
                    etapas origem/destino e timestamp.
                </li>
            </ul>
        </div>
    );
}
