"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { CrmClientForm } from "@/components/crm/CrmClientForm";
import {
    createCrmClient,
    deleteClient,
    getOrganizations,
    listClients,
    listOrgMembers,
    updateClient,
    type CreateCrmClientBody,
    type CrmClientDTO,
    type OrganizationDTO,
    type OrganizationMemberDTO,
    type PatchCrmClientBody,
} from "@/lib/api";

export default function AdminClientesPage() {
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    const [orgs, setOrgs] = useState<OrganizationDTO[]>([]);
    const [orgId, setOrgId] = useState("");
    const [members, setMembers] = useState<OrganizationMemberDTO[]>([]);
    const [tenantId, setTenantId] = useState("");
    const [rows, setRows] = useState<CrmClientDTO[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadingList, setLoadingList] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState<"create" | "edit">("create");
    const [editing, setEditing] = useState<CrmClientDTO | null>(null);
    const [formKey, setFormKey] = useState(0);
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

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

    const loadClients = useCallback(async () => {
        if (!token || !tenantId.trim()) {
            setError("Selecione o tenant (membro admin).");
            return;
        }
        setLoadingList(true);
        setError(null);
        try {
            const data = await listClients(token, tenantId.trim());
            setRows(data);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Falha ao listar clientes.");
            setRows([]);
        } finally {
            setLoadingList(false);
        }
    }, [token, tenantId]);

    const openCreate = () => {
        setModalMode("create");
        setEditing(null);
        setFormError(null);
        setFormKey((k) => k + 1);
        setModalOpen(true);
    };

    const openEdit = (row: CrmClientDTO) => {
        setModalMode("edit");
        setEditing(row);
        setFormError(null);
        setFormKey((k) => k + 1);
        setModalOpen(true);
    };

    const closeModal = () => {
        setModalOpen(false);
        setEditing(null);
        setFormError(null);
    };

    const handleFormSubmit = async (payload: CreateCrmClientBody | PatchCrmClientBody) => {
        if (!token) return;
        setSubmitting(true);
        setFormError(null);
        try {
            if (modalMode === "create") {
                await createCrmClient(payload as CreateCrmClientBody, token);
            } else if (editing) {
                await updateClient(editing.id, payload as PatchCrmClientBody, token);
            }
            closeModal();
            await loadClients();
        } catch (e) {
            setFormError(e instanceof Error ? e.message : "Erro ao salvar.");
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (row: CrmClientDTO) => {
        if (!token) return;
        if (!window.confirm(`Excluir cliente "${row.display_name}"? Esta ação não remove leads vinculados.`)) return;
        setError(null);
        try {
            await deleteClient(row.id, token);
            await loadClients();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Falha ao excluir.");
        }
    };

    return (
        <div className="max-w-6xl space-y-6">
            <div className="flex flex-wrap items-center gap-4">
                <Link href="/admin" className="text-sm text-primary hover:underline">
                    ← Início do console
                </Link>
            </div>
            <h1 className="text-2xl font-bold font-display">Clientes CRM</h1>
            <p className="text-sm text-text-secondary-light max-w-3xl">
                Listagem e CRUD por <strong>tenant</strong> (membro admin da organização). Usa{" "}
                <code className="text-xs bg-black/5 dark:bg-white/10 px-1 rounded">GET /api/clients?tenant_id=…</code> e
                rotas de criação/edição com validação de CPF/CNPJ no backend (AC9).
            </p>

            {loading && <p className="text-sm text-text-secondary-light">Carregando…</p>}
            {error && !modalOpen && (
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
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={() => void loadClients()}
                        disabled={loadingList || !tenantId}
                        className="h-10 px-4 rounded-xl bg-primary text-white text-sm font-semibold disabled:opacity-50"
                    >
                        {loadingList ? "Carregando…" : "Carregar clientes"}
                    </button>
                    <button
                        type="button"
                        onClick={openCreate}
                        disabled={!tenantId}
                        className="h-10 px-4 rounded-xl border border-border-light dark:border-border-dark text-sm font-medium disabled:opacity-50"
                    >
                        Novo cliente
                    </button>
                </div>
            </div>

            {rows.length > 0 && (
                <div className="glass-effect rounded-2xl border border-border-light dark:border-border-dark overflow-x-auto">
                    <table className="w-full text-sm min-w-[640px]">
                        <thead className="bg-black/5 dark:bg-white/5 text-left">
                            <tr>
                                <th className="p-3 font-semibold">Tipo</th>
                                <th className="p-3 font-semibold">Nome</th>
                                <th className="p-3 font-semibold">CPF/CNPJ</th>
                                <th className="p-3 font-semibold">Telefones</th>
                                <th className="p-3 font-semibold">Cidade/UF</th>
                                <th className="p-3 font-semibold">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((c) => (
                                <tr key={c.id} className="border-t border-border-light dark:border-border-dark">
                                    <td className="p-3">{c.person_type}</td>
                                    <td className="p-3 font-medium">{c.display_name}</td>
                                    <td className="p-3 font-mono text-xs">
                                        {c.person_type === "PF" ? c.cpf ?? "—" : c.cnpj ?? "—"}
                                    </td>
                                    <td className="p-3 max-w-[200px] truncate" title={(c.phones || []).join(", ")}>
                                        {(c.phones || []).join(", ") || "—"}
                                    </td>
                                    <td className="p-3">
                                        {[c.city, c.state].filter(Boolean).join("/") || "—"}
                                    </td>
                                    <td className="p-3">
                                        <div className="flex flex-wrap gap-2">
                                            <button
                                                type="button"
                                                className="text-primary text-xs font-semibold hover:underline"
                                                onClick={() => openEdit(c)}
                                            >
                                                Editar
                                            </button>
                                            <button
                                                type="button"
                                                className="text-red-600 dark:text-red-400 text-xs font-semibold hover:underline"
                                                onClick={() => void handleDelete(c)}
                                            >
                                                Excluir
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {modalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-background-light dark:bg-background-dark border border-border-light dark:border-border-dark rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-hidden p-6">
                        <h2 className="text-lg font-bold font-display mb-4">
                            {modalMode === "create" ? "Novo cliente" : "Editar cliente"}
                        </h2>
                        <CrmClientForm
                            key={formKey}
                            mode={modalMode}
                            tenantIdForCreate={tenantId.trim()}
                            initial={editing}
                            submitting={submitting}
                            serverError={formError}
                            onSubmit={handleFormSubmit}
                            onCancel={closeModal}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
