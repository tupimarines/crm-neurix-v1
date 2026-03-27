"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { getUser, patchUser, type UserDetailResponse } from "@/lib/api";

export default function AdminUserDetailPage() {
    const params = useParams();
    const userId = params.userId as string;
    const [data, setData] = useState<UserDetailResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    const [fullName, setFullName] = useState("");
    const [companyName, setCompanyName] = useState("");
    const [phonesRaw, setPhonesRaw] = useState("");
    const [orgForPatch, setOrgForPatch] = useState("");
    const [patchRole, setPatchRole] = useState<"admin" | "read_only">("admin");
    const [patchFunnel, setPatchFunnel] = useState("");
    const [busy, setBusy] = useState(false);

    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;

    const load = async () => {
        if (!token || !userId) return;
        setLoading(true);
        setError(null);
        try {
            const u = await getUser(userId, token);
            setData(u);
            setFullName(u.full_name || "");
            setCompanyName(u.company_name || "");
            setPhonesRaw((u.phones || []).join("\n"));
            if (u.memberships.length) {
                setOrgForPatch(u.memberships[0].organization_id);
                setPatchRole(u.memberships[0].role as "admin" | "read_only");
                setPatchFunnel(u.memberships[0].assigned_funnel_id || "");
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : "Erro ao carregar.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId]);

    const saveProfile = async () => {
        if (!token || !userId || !orgForPatch) return;
        if (patchRole === "read_only" && !patchFunnel.trim()) {
            setError("Funil obrigatório (assigned_funnel_id) para papel read_only.");
            return;
        }
        setBusy(true);
        setError(null);
        try {
            const phones = phonesRaw
                .split(/[\n,;]+/)
                .map((p) => p.trim())
                .filter(Boolean);
            await patchUser(
                userId,
                orgForPatch,
                {
                    full_name: fullName.trim(),
                    company_name: companyName.trim() || null,
                    phones,
                    role: patchRole,
                    assigned_funnel_id: patchRole === "read_only" ? patchFunnel.trim() : null,
                },
                token
            );
            await load();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Falha ao salvar.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="max-w-xl space-y-6">
            <Link href="/admin/users" className="text-sm text-primary hover:underline">
                ← Criar / listar fluxo
            </Link>

            {loading && <p className="text-sm text-text-secondary-light">Carregando…</p>}
            {error && (
                <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-700 text-sm px-4 py-3">
                    {error}
                </div>
            )}

            {data && (
                <>
                    <div>
                        <h1 className="text-2xl font-bold font-display">Usuário</h1>
                        <p className="text-xs font-mono text-text-secondary-light mt-1">{data.id}</p>
                        <p className="text-sm mt-2">{data.email || "—"}</p>
                    </div>

                    <div className="glass-effect rounded-2xl border border-border-light dark:border-border-dark p-6 space-y-4">
                        <h2 className="font-semibold">Memberships</h2>
                        <ul className="text-sm space-y-2">
                            {data.memberships.map((m) => (
                                <li key={m.organization_id} className="font-mono text-xs break-all">
                                    org {m.organization_id} — {m.role}{" "}
                                    {m.assigned_funnel_id ? `— funnel ${m.assigned_funnel_id}` : ""}
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div className="glass-effect rounded-2xl border border-border-light dark:border-border-dark p-6 space-y-4">
                        <h2 className="font-semibold">Editar (PATCH com organization_id)</h2>
                        <div>
                            <label className="text-sm font-medium">Organização (escopo do PATCH)</label>
                            <select
                                className="mt-1 w-full h-11 rounded-xl border border-border-light dark:border-border-dark bg-white dark:bg-surface-dark px-3 text-sm"
                                value={orgForPatch}
                                onChange={(e) => setOrgForPatch(e.target.value)}
                            >
                                {data.memberships.map((m) => (
                                    <option key={m.organization_id} value={m.organization_id}>
                                        {m.organization_id}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="text-sm font-medium">Nome completo</label>
                            <input
                                className="mt-1 w-full h-11 rounded-xl border border-border-light dark:border-border-dark bg-white dark:bg-surface-dark px-3"
                                value={fullName}
                                onChange={(e) => setFullName(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium">Empresa</label>
                            <input
                                className="mt-1 w-full h-11 rounded-xl border border-border-light dark:border-border-dark bg-white dark:bg-surface-dark px-3"
                                value={companyName}
                                onChange={(e) => setCompanyName(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium">Telefones</label>
                            <textarea
                                className="mt-1 w-full min-h-[72px] rounded-xl border border-border-light dark:border-border-dark bg-white dark:bg-surface-dark px-3 py-2 text-sm"
                                value={phonesRaw}
                                onChange={(e) => setPhonesRaw(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium">Papel na organização</label>
                            <select
                                className="mt-1 w-full h-11 rounded-xl border border-border-light dark:border-border-dark bg-white dark:bg-surface-dark px-3"
                                value={patchRole}
                                onChange={(e) => setPatchRole(e.target.value as "admin" | "read_only")}
                            >
                                <option value="admin">admin</option>
                                <option value="read_only">read_only</option>
                            </select>
                        </div>
                        {patchRole === "read_only" && (
                            <div>
                                <label className="text-sm font-medium">assigned_funnel_id</label>
                                <input
                                    className="mt-1 w-full h-11 rounded-xl border border-border-light dark:border-border-dark bg-white dark:bg-surface-dark px-3 font-mono text-sm"
                                    value={patchFunnel}
                                    onChange={(e) => setPatchFunnel(e.target.value)}
                                />
                            </div>
                        )}
                        <button
                            type="button"
                            onClick={saveProfile}
                            disabled={busy}
                            className="h-11 px-6 rounded-xl bg-primary text-white font-semibold disabled:opacity-50"
                        >
                            {busy ? "Salvando…" : "Salvar"}
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}
