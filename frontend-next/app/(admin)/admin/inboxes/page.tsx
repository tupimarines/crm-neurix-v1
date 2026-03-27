"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
    getOrganizations,
    listAdminInboxes,
    listOrgMembers,
    type InboxDTO,
    type OrganizationDTO,
    type OrganizationMemberDTO,
} from "@/lib/api";

export default function AdminInboxesLinkPage() {
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    const [orgs, setOrgs] = useState<OrganizationDTO[]>([]);
    const [orgId, setOrgId] = useState("");
    const [members, setMembers] = useState<OrganizationMemberDTO[]>([]);
    const [tenantId, setTenantId] = useState("");
    const [rows, setRows] = useState<InboxDTO[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadingInboxes, setLoadingInboxes] = useState(false);

    const adminMembers = useMemo(() => members.filter((m) => m.role === "admin"), [members]);

    useEffect(() => {
        if (!token) return;
        (async () => {
            setLoading(true);
            try {
                const list = await getOrganizations(token);
                setOrgs(list);
                if (list.length) setOrgId((prev) => prev || list[0].id);
            } catch (e) {
                setError(e instanceof Error ? e.message : "Erro ao carregar organizações.");
            } finally {
                setLoading(false);
            }
        })();
    }, [token]);

    useEffect(() => {
        if (!token || !orgId) return;
        (async () => {
            try {
                const m = await listOrgMembers(orgId, token);
                setMembers(m);
                const admins = m.filter((x) => x.role === "admin");
                if (admins.length)
                    setTenantId((prev) =>
                        prev && admins.some((a) => a.user_id === prev) ? prev : admins[0].user_id
                    );
                else setTenantId("");
            } catch (e) {
                setError(e instanceof Error ? e.message : "Erro ao carregar membros.");
            }
        })();
    }, [token, orgId]);

    const loadInboxes = async () => {
        if (!token || !tenantId.trim()) {
            setError("Selecione o tenant (membro admin).");
            return;
        }
        setLoadingInboxes(true);
        setError(null);
        try {
            const data = await listAdminInboxes(tenantId.trim(), token);
            setRows(data);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Falha ao listar caixas.");
            setRows([]);
        } finally {
            setLoadingInboxes(false);
        }
    };

    return (
        <div className="max-w-5xl space-y-8">
            <div className="flex flex-wrap items-center gap-4">
                <Link href="/admin" className="text-sm text-primary hover:underline">
                    ← Início do console
                </Link>
            </div>

            <div>
                <h1 className="text-2xl font-bold font-display">Caixas de entrada (Uazapi)</h1>
                <p className="text-sm text-text-secondary-light max-w-2xl mt-2">
                    O fluxo completo de conexão (QR, instância, Leads Infinitos) e o vínculo com funil ficam em{" "}
                    <strong>Configurações</strong> no app tenant. Aqui você pode apenas{" "}
                    <strong>visualizar</strong> caixas por tenant (superadmin) e abrir o app para operar.
                </p>
            </div>

            <div className="glass-effect rounded-2xl border border-border-light dark:border-border-dark p-6 space-y-4">
                <h2 className="text-lg font-semibold">Ir para Configurações</h2>
                <p className="text-sm text-text-secondary-light">
                    Conexão Uazapi e criação de novas caixas: use o app principal. O parâmetro{" "}
                    <code className="text-xs bg-black/5 dark:bg-white/10 px-1 rounded">from=admin</code> prepara o
                    banner &quot;Voltar ao Console&quot; (Sprint 8).
                </p>
                <Link
                    href="/configuracoes?from=admin"
                    className="inline-flex h-11 items-center px-6 rounded-xl bg-primary text-white font-semibold text-sm"
                >
                    Ir para Configurações
                </Link>
            </div>

            <div className="glass-effect rounded-2xl border border-border-light dark:border-border-dark p-6 space-y-4">
                <h2 className="text-lg font-semibold">Somente leitura — caixas por tenant</h2>
                <p className="text-sm text-text-secondary-light">
                    Usa <code className="text-xs bg-black/5 px-1 rounded">GET /api/admin/inboxes?tenant_id=…</code>{" "}
                    (JWT superadmin; sem service role no browser).
                </p>

                {loading && <p className="text-sm text-text-secondary-light">Carregando organizações…</p>}
                {error && (
                    <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm px-4 py-3">
                        {error}
                    </div>
                )}

                <div className="grid gap-4 max-w-xl">
                    <div>
                        <label className="text-sm font-medium">Organização</label>
                        <select
                            className="mt-1 w-full h-10 rounded-xl border border-border-light dark:border-border-dark bg-white dark:bg-surface-dark px-3 text-sm"
                            value={orgId}
                            onChange={(e) => {
                                setOrgId(e.target.value);
                                setTenantId("");
                                setRows([]);
                            }}
                        >
                            <option value="">—</option>
                            {orgs.map((o) => (
                                <option key={o.id} value={o.id}>
                                    {o.name}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="text-sm font-medium">Tenant (membro admin)</label>
                        <select
                            className="mt-1 w-full h-10 rounded-xl border border-border-light dark:border-border-dark bg-white dark:bg-surface-dark px-3 text-sm"
                            value={tenantId}
                            onChange={(e) => {
                                setTenantId(e.target.value);
                                setRows([]);
                            }}
                            disabled={!adminMembers.length}
                        >
                            <option value="">—</option>
                            {adminMembers.map((m) => (
                                <option key={m.user_id} value={m.user_id}>
                                    {m.user_id}
                                </option>
                            ))}
                        </select>
                    </div>
                    <button
                        type="button"
                        onClick={() => void loadInboxes()}
                        disabled={loadingInboxes || !tenantId}
                        className="h-10 px-4 rounded-xl bg-primary/90 text-white text-sm font-medium disabled:opacity-50 w-fit"
                    >
                        {loadingInboxes ? "Carregando…" : "Listar caixas"}
                    </button>
                </div>

                {rows.length > 0 && (
                    <div className="overflow-x-auto rounded-xl border border-border-light dark:border-border-dark">
                        <table className="w-full text-sm">
                            <thead className="bg-black/5 dark:bg-white/5">
                                <tr>
                                    <th className="text-left p-3 font-medium">Nome</th>
                                    <th className="text-left p-3 font-medium">Funil (UUID)</th>
                                    <th className="text-left p-3 font-medium">Atualizado</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((r) => (
                                    <tr key={r.id} className="border-t border-border-light dark:border-border-dark">
                                        <td className="p-3">{r.name}</td>
                                        <td className="p-3 font-mono text-xs">{r.funnel_id}</td>
                                        <td className="p-3 text-text-secondary-light">
                                            {new Date(r.updated_at).toLocaleString()}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                {!loadingInboxes && tenantId && rows.length === 0 && (
                    <p className="text-sm text-text-secondary-light">Nenhuma caixa encontrada para este tenant.</p>
                )}
            </div>
        </div>
    );
}
