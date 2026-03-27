"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
    createOrganization,
    deleteOrganization,
    getOrganizations,
    updateOrganization,
    type OrganizationDTO,
} from "@/lib/api";

export default function AdminOrganizationsPage() {
    const [rows, setRows] = useState<OrganizationDTO[] | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [modal, setModal] = useState<"create" | "edit" | null>(null);
    const [name, setName] = useState("");
    const [editId, setEditId] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;

    const load = async () => {
        if (!token) return;
        setLoading(true);
        setError(null);
        try {
            const list = await getOrganizations(token);
            setRows(list);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Erro ao listar.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const openCreate = () => {
        setName("");
        setEditId(null);
        setModal("create");
    };

    const openEdit = (o: OrganizationDTO) => {
        setName(o.name);
        setEditId(o.id);
        setModal("edit");
    };

    const submitCreate = async () => {
        if (!token || !name.trim()) return;
        setBusy(true);
        try {
            await createOrganization({ name: name.trim() }, token);
            setModal(null);
            await load();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Falha ao criar.");
        } finally {
            setBusy(false);
        }
    };

    const submitEdit = async () => {
        if (!token || !editId || !name.trim()) return;
        setBusy(true);
        try {
            await updateOrganization(editId, { name: name.trim() }, token);
            setModal(null);
            await load();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Falha ao atualizar.");
        } finally {
            setBusy(false);
        }
    };

    const confirmDelete = async (o: OrganizationDTO) => {
        if (!token) return;
        if (!confirm(`Excluir organização "${o.name}"? Esta ação não pode ser desfeita.`)) return;
        setBusy(true);
        try {
            await deleteOrganization(o.id, token);
            await load();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Falha ao excluir.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="max-w-5xl space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold font-display">Organizações</h1>
                    <p className="text-sm text-text-secondary-light mt-1">CRUD global (superadmin)</p>
                </div>
                <button
                    type="button"
                    onClick={openCreate}
                    className="h-10 px-4 rounded-xl bg-primary text-white font-semibold text-sm hover:bg-primary-hover"
                >
                    Nova organização
                </button>
            </div>

            {error && (
                <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm px-4 py-3">
                    {error}
                </div>
            )}

            <div className="glass-effect rounded-2xl border border-border-light dark:border-border-dark overflow-hidden">
                {loading && <p className="p-6 text-sm text-text-secondary-light">Carregando…</p>}
                {!loading && rows && rows.length === 0 && (
                    <p className="p-6 text-sm text-text-secondary-light">Nenhuma organização ainda.</p>
                )}
                {!loading && rows && rows.length > 0 && (
                    <table className="w-full text-sm">
                        <thead className="bg-black/5 dark:bg-white/5 text-left">
                            <tr>
                                <th className="p-3 font-semibold">Nome</th>
                                <th className="p-3 font-semibold">Criada</th>
                                <th className="p-3 font-semibold w-48">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((o) => (
                                <tr key={o.id} className="border-t border-border-light dark:border-border-dark">
                                    <td className="p-3">
                                        <Link href={`/admin/organizations/${o.id}`} className="text-primary font-medium hover:underline">
                                            {o.name}
                                        </Link>
                                    </td>
                                    <td className="p-3 text-text-secondary-light">
                                        {new Date(o.created_at).toLocaleString("pt-BR")}
                                    </td>
                                    <td className="p-3 flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            onClick={() => openEdit(o)}
                                            className="text-xs px-2 py-1 rounded-lg border border-border-light dark:border-border-dark hover:bg-black/5"
                                        >
                                            Editar
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => confirmDelete(o)}
                                            disabled={busy}
                                            className="text-xs px-2 py-1 rounded-lg border border-red-300 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                                        >
                                            Excluir
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {modal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
                    <div className="glass-effect rounded-2xl border border-border-light dark:border-border-dark p-6 w-full max-w-md shadow-xl">
                        <h2 className="text-lg font-bold mb-4">
                            {modal === "create" ? "Nova organização" : "Editar organização"}
                        </h2>
                        <label className="block text-sm font-medium mb-1">Nome</label>
                        <input
                            className="w-full h-11 rounded-xl border border-border-light dark:border-border-dark bg-white dark:bg-surface-dark px-3 mb-4"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Nome da empresa"
                        />
                        <div className="flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setModal(null)}
                                className="h-10 px-4 rounded-xl border border-border-light dark:border-border-dark text-sm"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                disabled={busy || !name.trim()}
                                onClick={modal === "create" ? submitCreate : submitEdit}
                                className="h-10 px-4 rounded-xl bg-primary text-white text-sm font-semibold disabled:opacity-50"
                            >
                                {busy ? "Salvando…" : "Salvar"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
