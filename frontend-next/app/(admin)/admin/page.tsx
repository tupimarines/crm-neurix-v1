"use client";

import { useEffect, useState } from "react";

import { getOrganizations, type OrganizationDTO } from "@/lib/api";

export default function AdminHomePage() {
    const [orgs, setOrgs] = useState<OrganizationDTO[] | null>(null);
    const [err, setErr] = useState<string | null>(null);

    useEffect(() => {
        const token = localStorage.getItem("access_token");
        if (!token) return;
        (async () => {
            try {
                const list = await getOrganizations(token);
                setOrgs(list);
            } catch (e) {
                setErr(e instanceof Error ? e.message : "Erro ao carregar organizações.");
            }
        })();
    }, []);

    return (
        <div className="max-w-3xl space-y-8">
            <div>
                <h1 className="text-2xl font-bold font-display">Painel do Console</h1>
                <p className="text-text-secondary-light dark:text-text-secondary-dark text-sm mt-1">
                    Visão geral para superadmin — gestão global de organizações e usuários.
                </p>
            </div>

            <div className="glass-effect rounded-2xl border border-border-light dark:border-border-dark p-6 shadow-lg shadow-primary/5">
                <h2 className="text-sm font-semibold text-text-secondary-light uppercase tracking-wide mb-2">
                    Organizações
                </h2>
                {err && (
                    <p className="text-red-600 dark:text-red-400 text-sm">{err}</p>
                )}
                {!err && orgs === null && <p className="text-sm text-text-secondary-light">Carregando…</p>}
                {!err && orgs !== null && (
                    <p className="text-3xl font-bold text-primary">{orgs.length}</p>
                )}
                {!err && orgs !== null && (
                    <p className="text-sm text-text-secondary-light mt-1">total cadastrado(s)</p>
                )}
            </div>

            <div className="glass-effect rounded-2xl border border-border-light dark:border-border-dark p-6 shadow-lg shadow-primary/5">
                <h2 className="text-lg font-bold mb-3">Próximos passos</h2>
                <ul className="list-disc list-inside text-sm text-text-secondary-light space-y-2">
                    <li>
                        Garantir migração <strong>008</strong> (funil Default + backfill) aplicada no Supabase antes de
                        depender de <code className="text-xs bg-black/5 dark:bg-white/10 px-1 rounded">funnel_id</code>{" "}
                        em produção.
                    </li>
                    <li>Sprint 6: Kanban e APIs por funil; dropdowns de funil no console passam a listar dados reais.</li>
                    <li>Sprint 7–8: Inboxes Uazapi e Configurações — link na seção Configurações / Inboxes.</li>
                </ul>
            </div>
        </div>
    );
}
