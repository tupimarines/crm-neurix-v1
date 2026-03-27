"use client";

export default function AdminHelpPage() {
    return (
        <div className="max-w-2xl space-y-4 text-sm text-text-secondary-light">
            <h1 className="text-2xl font-bold font-display text-text-main-light dark:text-text-main-dark">Ajuda</h1>
            <ul className="list-disc list-inside space-y-2">
                <li>Superadmin: login → escolha &quot;Console Admin&quot; ou &quot;Ir para o app&quot;.</li>
                <li>
                    Organizações e usuários usam apenas a API FastAPI com JWT — sem service role no navegador (AC11).
                </li>
                <li>Migração 008: funil Default + backfill de funnel_id no Supabase antes de operar funis em produção.</li>
            </ul>
        </div>
    );
}
