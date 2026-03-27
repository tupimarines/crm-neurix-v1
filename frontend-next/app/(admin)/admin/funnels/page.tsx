"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
    getAdminFunnels,
    getOrganizations,
    listOrgMembers,
    type OrganizationDTO,
    type OrganizationMemberDTO,
    type OrganizationFunnelItem,
} from "@/lib/api";

export default function AdminFunnelsPage() {
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    const [orgs, setOrgs] = useState<OrganizationDTO[]>([]);
    const [orgId, setOrgId] = useState("");
    const [members, setMembers] = useState<OrganizationMemberDTO[]>([]);
    const [tenantId, setTenantId] = useState("");
    const [rows, setRows] = useState<OrganizationFunnelItem[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadingFunnels, setLoadingFunnels] = useState(false);

    const adminMembers = useMemo(
        () => members.filter((m) => m.role === "admin"),
        [members]
    );

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

    const loadFunnels = async () => {
        if (!token || !tenantId.trim()) {
            setError("Selecione o tenant (membro admin).");
            return;
        }
        setLoadingFunnels(true);
        setError(null);
        try {
            const data = await getAdminFunnels(tenantId.trim(), token);
            setRows(data);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Falha ao listar funis.");
            setRows([]);
        } finally {
            setLoadingFunnels(false);
        }
    };

    return (
        <div className="max-w-5xl space-y-6">
            <div className="flex flex-wrap items-center gap-4">
                <Link href="/admin" className="text-sm text-primary hover:underline">
                    ← Início do console
                </Link>
            </div>
            <h1 className="text-2xl font-bold font-display">Funis por tenant</h1>
            <p className="text-sm text-text-secondary-light max-w-2xl">
                Listagem somente leitura via <code className="text-xs bg-black/5 px-1 rounded">GET /api/admin/funnels</code>{" "}
                (superadmin). Escolha o tenant admin cujos funis deseja inspecionar.
            </p>

            {loading && <p className="text-sm text-text-secondary-light">Carregando…</p>}
            {error && (
                <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm px-4 py-3">
                    {error}
                </div>
            )}

            <div className="glass-effect rounded-2xl border border-border-light dark:border-border-dark p-4 space-y-4 max-w-xl">
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
                    <label className="text-sm font-medium">Tenant (admin da org)</label>
                    <select
                        className="mt-1 w-full h-10 rounded-xl border border-border-light dark:border-border-dark bg-white dark:bg-surface-dark px-3 text-sm font-mono"
                        value={tenantId}
                        onChange={(e) => {
                            setTenantId(e.target.value);
                            setRows([]);
                        }}
                    >
                        <option value="">—</option>
                        {adminMembers.map((m) => (
                            <option key={m.user_id} value={m.user_id}>
                                {m.user_id.slice(0, 8)}… (admin)
                            </option>
                        ))}
                    </select>
                </div>
                <button
                    type="button"
                    onClick={() => void loadFunnels()}
                    disabled={loadingFunnels || !tenantId}
                    className="h-10 px-4 rounded-xl bg-primary text-white text-sm font-semibold disabled:opacity-50"
                >
                    {loadingFunnels ? "Carregando…" : "Carregar funis"}
                </button>
            </div>

            {rows.length > 0 && (
                <div className="glass-effect rounded-2xl border border-border-light dark:border-border-dark overflow-x-auto">
                    <table className="w-full text-sm min-w-[560px]">
                        <thead className="bg-black/5 dark:bg-white/5 text-left">
                            <tr>
                                <th className="p-3 font-semibold">Nome</th>
                                <th className="p-3 font-semibold">ID</th>
                                <th className="p-3 font-semibold">Tenant</th>
                                <th className="p-3 font-semibold w-44">Kanban</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((f) => (
                                <tr key={f.id} className="border-t border-border-light dark:border-border-dark">
                                    <td className="p-3">{f.name}</td>
                                    <td className="p-3 font-mono text-xs break-all">{f.id}</td>
                                    <td className="p-3 font-mono text-xs break-all">{f.tenant_id}</td>
                                    <td className="p-3">
                                        <Link
                                            href={`/kanban?funnel_id=${encodeURIComponent(f.id)}`}
                                            className="text-primary text-xs hover:underline"
                                        >
                                            Abrir Kanban
                                        </Link>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
