"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { createUser, getOrganizations, type OrganizationDTO } from "@/lib/api";

export default function AdminUsersCreatePage() {
    const [orgs, setOrgs] = useState<OrganizationDTO[]>([]);
    const [orgId, setOrgId] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [fullName, setFullName] = useState("");
    const [companyName, setCompanyName] = useState("");
    const [phonesRaw, setPhonesRaw] = useState("");
    const [role, setRole] = useState<"admin" | "read_only">("admin");
    const [funnelId, setFunnelId] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [createdId, setCreatedId] = useState<string | null>(null);

    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;

    useEffect(() => {
        const t = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
        if (!t) return;
        (async () => {
            try {
                const list = await getOrganizations(t);
                setOrgs(list);
                setOrgId((prev) => prev || (list[0]?.id ?? ""));
            } catch {
                /* ignore */
            }
        })();
    }, []);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!token || !orgId) return;
        if (role === "read_only" && !funnelId.trim()) {
            setError("Funil obrigatório para usuário read_only.");
            return;
        }
        setBusy(true);
        setError(null);
        setCreatedId(null);
        const phones = phonesRaw
            .split(/[\n,;]+/)
            .map((p) => p.trim())
            .filter(Boolean);
        try {
            const res = await createUser(
                {
                    organization_id: orgId,
                    email,
                    password,
                    full_name: fullName,
                    company_name: companyName || undefined,
                    phones,
                    role,
                    assigned_funnel_id: role === "read_only" ? funnelId.trim() : null,
                },
                token
            );
            setCreatedId(res.id);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Erro ao criar usuário.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="max-w-xl space-y-6">
            <div>
                <h1 className="text-2xl font-bold font-display">Criar usuário</h1>
                <p className="text-sm text-text-secondary-light mt-1">
                    <code className="text-xs">POST /api/users</code> — Auth Admin via backend.
                </p>
            </div>

            {createdId && (
                <div className="rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200 text-sm px-4 py-3 space-y-2">
                    <p>Usuário criado.</p>
                    <Link href={`/admin/users/${createdId}`} className="text-primary font-semibold hover:underline">
                        Ver perfil → {createdId}
                    </Link>
                </div>
            )}

            {error && (
                <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm px-4 py-3">
                    {error}
                </div>
            )}

            <form onSubmit={submit} className="glass-effect rounded-2xl border border-border-light dark:border-border-dark p-6 space-y-4">
                <div>
                    <label className="text-sm font-medium">Organização</label>
                    <select
                        className="mt-1 w-full h-11 rounded-xl border border-border-light dark:border-border-dark bg-white dark:bg-surface-dark px-3"
                        value={orgId}
                        onChange={(e) => setOrgId(e.target.value)}
                        required
                    >
                        <option value="">Selecione…</option>
                        {orgs.map((o) => (
                            <option key={o.id} value={o.id}>
                                {o.name}
                            </option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="text-sm font-medium">Email</label>
                    <input
                        type="email"
                        className="mt-1 w-full h-11 rounded-xl border border-border-light dark:border-border-dark bg-white dark:bg-surface-dark px-3"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                    />
                </div>
                <div>
                    <label className="text-sm font-medium">Senha</label>
                    <input
                        type="password"
                        className="mt-1 w-full h-11 rounded-xl border border-border-light dark:border-border-dark bg-white dark:bg-surface-dark px-3"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={8}
                    />
                </div>
                <div>
                    <label className="text-sm font-medium">Nome completo</label>
                    <input
                        className="mt-1 w-full h-11 rounded-xl border border-border-light dark:border-border-dark bg-white dark:bg-surface-dark px-3"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        required
                    />
                </div>
                <div>
                    <label className="text-sm font-medium">Empresa (opcional)</label>
                    <input
                        className="mt-1 w-full h-11 rounded-xl border border-border-light dark:border-border-dark bg-white dark:bg-surface-dark px-3"
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                    />
                </div>
                <div>
                    <label className="text-sm font-medium">Telefones (um por linha ou separados por vírgula)</label>
                    <textarea
                        className="mt-1 w-full min-h-[80px] rounded-xl border border-border-light dark:border-border-dark bg-white dark:bg-surface-dark px-3 py-2 text-sm"
                        value={phonesRaw}
                        onChange={(e) => setPhonesRaw(e.target.value)}
                    />
                </div>
                <div>
                    <label className="text-sm font-medium">Papel</label>
                    <select
                        className="mt-1 w-full h-11 rounded-xl border border-border-light dark:border-border-dark bg-white dark:bg-surface-dark px-3"
                        value={role}
                        onChange={(e) => setRole(e.target.value as "admin" | "read_only")}
                    >
                        <option value="admin">admin</option>
                        <option value="read_only">read_only</option>
                    </select>
                </div>
                {role === "read_only" && (
                    <div>
                        <label className="text-sm font-medium">assigned_funnel_id</label>
                        <input
                            className="mt-1 w-full h-11 rounded-xl border border-border-light dark:border-border-dark bg-white dark:bg-surface-dark px-3 font-mono text-sm"
                            value={funnelId}
                            onChange={(e) => setFunnelId(e.target.value)}
                            placeholder="UUID"
                        />
                    </div>
                )}
                <button
                    type="submit"
                    disabled={busy}
                    className="w-full h-12 rounded-xl bg-primary text-white font-bold disabled:opacity-50"
                >
                    {busy ? "Criando…" : "Criar usuário"}
                </button>
            </form>
        </div>
    );
}
