"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

interface EditProfileModalProps {
    onClose: () => void;
}

export default function EditProfileModal({ onClose }: EditProfileModalProps) {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [successMsg, setSuccessMsg] = useState("");

    // User & Profile Data
    const [userId, setUserId] = useState("");
    const [email, setEmail] = useState("");
    const [fullName, setFullName] = useState("");
    const [companyName, setCompanyName] = useState("");
    const [phone, setPhone] = useState("");
    const [cnpj, setCnpj] = useState("");
    const [address, setAddress] = useState("");
    const [newPassword, setNewPassword] = useState("");

    useEffect(() => {
        async function loadProfile() {
            try {
                const { data: { user }, error: userError } = await supabase.auth.getUser();
                if (userError || !user) throw new Error("Usuário não autenticado");

                setUserId(user.id);
                setEmail(user.email || "");

                const { data: profile, error: profileError } = await supabase
                    .from("profiles")
                    .select("*")
                    .eq("id", user.id)
                    .single();

                if (profileError && profileError.code !== "PGRST116") {
                    throw profileError;
                }

                if (profile) {
                    setFullName(profile.full_name || "");
                    setCompanyName(profile.company_name || "");
                    // Assume these fields exist or we add them. If they don't exist yet, this won't break.
                    // The feature prompt requests them, so we include them in the state.
                    setPhone((profile as any).phone || "");
                    setCnpj((profile as any).cnpj || "");
                    setAddress((profile as any).address || "");
                }
            } catch (err: any) {
                console.error("Erro ao carregar perfil:", err);
                setError(err.message || "Erro ao carregar os dados.");
            } finally {
                setLoading(false);
            }
        }
        loadProfile();
    }, []);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setError("");
        setSuccessMsg("");

        try {
            // Update profile
            const { error: updateError } = await supabase
                .from("profiles")
                .update({
                    full_name: fullName,
                    company_name: companyName,
                    // If columns don't exist yet, this might error. Assuming they were added or need to be.
                    // The prompt just says "phone, cnpj, address, company_name". 
                    phone,
                    cnpj,
                    address
                })
                .eq("id", userId);

            if (updateError) throw updateError;

            // Update password if provided
            if (newPassword.trim().length > 0) {
                const { error: passError } = await supabase.auth.updateUser({
                    password: newPassword
                });
                if (passError) throw passError;
            }

            setSuccessMsg("Perfil atualizado com sucesso!");

            // Reload the page after 1.5s to reflect any header/sidebar changes
            setTimeout(() => {
                window.location.reload();
            }, 1000);

        } catch (err: any) {
            console.error("Erro ao salvar perfil:", err);
            setError(err.message || "Não foi possível salvar os dados.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm sm:p-0 animate-in fade-in duration-200">
            <div
                className="absolute inset-0"
                onClick={onClose}
                aria-hidden="true"
            />

            <div className="relative w-full max-h-[90vh] flex flex-col overflow-hidden rounded-2xl bg-surface-light shadow-2xl dark:bg-surface-dark sm:max-w-lg md:max-w-xl animate-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between border-b border-border-light px-6 py-4 dark:border-border-dark">
                    <h2 className="font-display text-xl font-bold text-text-main-light dark:text-text-main-dark">
                        Editar Perfil
                    </h2>
                    <button
                        onClick={onClose}
                        className="rounded-full p-2 text-text-secondary-light hover:bg-slate-100 hover:text-text-main-light dark:text-text-secondary-dark dark:hover:bg-slate-800 dark:hover:text-text-main-dark transition-colors"
                    >
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                <div className="overflow-y-auto px-6 py-4">
                    {loading ? (
                        <div className="flex h-40 flex-col items-center justify-center gap-3">
                            <span className="material-symbols-outlined animate-spin text-4xl text-primary">
                                progress_activity
                            </span>
                            <p className="text-sm text-text-secondary-light">Carregando dados...</p>
                        </div>
                    ) : (
                        <form id="edit-profile-form" onSubmit={handleSave} className="flex flex-col gap-4">
                            {error && (
                                <div className="rounded-lg bg-red-50 p-3 text-sm font-medium text-red-600 dark:bg-red-900/20 dark:text-red-400">
                                    {error}
                                </div>
                            )}

                            {successMsg && (
                                <div className="rounded-lg bg-green-50 p-3 text-sm font-medium text-green-600 dark:bg-green-900/20 dark:text-green-400">
                                    {successMsg}
                                </div>
                            )}

                            <div>
                                <label className="mb-1 block text-sm font-medium text-text-main-light dark:text-text-main-dark">
                                    E-mail <span className="text-xs font-normal text-text-secondary-light">(somente leitura)</span>
                                </label>
                                <input
                                    type="email"
                                    value={email}
                                    disabled
                                    className="w-full rounded-xl border border-border-light bg-slate-100 px-4 py-2 text-sm text-text-secondary-light opacity-60 cursor-not-allowed dark:border-border-dark dark:bg-slate-800/50"
                                />
                            </div>

                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <div>
                                    <label className="mb-1 block text-sm font-medium text-text-main-light dark:text-text-main-dark">
                                        Nome Completo
                                    </label>
                                    <input
                                        type="text"
                                        value={fullName}
                                        onChange={(e) => setFullName(e.target.value)}
                                        className="w-full rounded-xl border border-border-light bg-white px-4 py-2 text-sm text-text-main-light focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-border-dark dark:bg-surface-dark dark:text-text-main-dark"
                                        required
                                    />
                                </div>

                                <div>
                                    <label className="mb-1 block text-sm font-medium text-text-main-light dark:text-text-main-dark">
                                        Empresa
                                    </label>
                                    <input
                                        type="text"
                                        value={companyName}
                                        onChange={(e) => setCompanyName(e.target.value)}
                                        className="w-full rounded-xl border border-border-light bg-white px-4 py-2 text-sm text-text-main-light focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-border-dark dark:bg-surface-dark dark:text-text-main-dark"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <div>
                                    <label className="mb-1 block text-sm font-medium text-text-main-light dark:text-text-main-dark">
                                        CNPJ
                                    </label>
                                    <input
                                        type="text"
                                        value={cnpj}
                                        onChange={(e) => setCnpj(e.target.value)}
                                        placeholder="00.000.000/0000-00"
                                        className="w-full rounded-xl border border-border-light bg-white px-4 py-2 text-sm text-text-main-light focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-border-dark dark:bg-surface-dark dark:text-text-main-dark"
                                    />
                                </div>

                                <div>
                                    <label className="mb-1 block text-sm font-medium text-text-main-light dark:text-text-main-dark">
                                        Telefone
                                    </label>
                                    <input
                                        type="text"
                                        value={phone}
                                        onChange={(e) => setPhone(e.target.value)}
                                        placeholder="(00) 00000-0000"
                                        className="w-full rounded-xl border border-border-light bg-white px-4 py-2 text-sm text-text-main-light focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-border-dark dark:bg-surface-dark dark:text-text-main-dark"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="mb-1 block text-sm font-medium text-text-main-light dark:text-text-main-dark">
                                    Endereço
                                </label>
                                <input
                                    type="text"
                                    value={address}
                                    onChange={(e) => setAddress(e.target.value)}
                                    placeholder="Rua, Número, Bairro, Cidade - UF"
                                    className="w-full rounded-xl border border-border-light bg-white px-4 py-2 text-sm text-text-main-light focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-border-dark dark:bg-surface-dark dark:text-text-main-dark"
                                />
                            </div>

                            <div className="mt-2 pt-4 border-t border-border-light dark:border-border-dark">
                                <label className="mb-1 block text-sm font-medium text-text-main-light dark:text-text-main-dark">
                                    Nova Senha
                                </label>
                                <input
                                    type="password"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    placeholder="Preencha apenas se quiser alterar"
                                    className="w-full rounded-xl border border-border-light bg-white px-4 py-2 text-sm text-text-main-light focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-border-dark dark:bg-surface-dark dark:text-text-main-dark"
                                />
                                <p className="text-xs text-text-secondary-light mt-1">
                                    Sua senha será alterada no mesmo instante se você preencher este campo e salvar.
                                </p>
                            </div>
                        </form>
                    )}
                </div>

                <div className="border-t border-border-light bg-slate-50 px-6 py-4 dark:border-border-dark dark:bg-surface-dark/50 flex justify-end gap-3 mt-auto">
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-xl px-5 py-2.5 text-sm font-medium text-text-secondary-light hover:bg-slate-200 hover:text-text-main-light dark:hover:bg-slate-800 dark:hover:text-text-main-dark transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        type="submit"
                        form="edit-profile-form"
                        disabled={loading || saving}
                        className="rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-primary/30 transition-all hover:bg-primary-hover disabled:opacity-50 flex items-center gap-2"
                    >
                        {saving ? (
                            <>
                                <span className="material-symbols-outlined animate-spin text-sm">
                                    progress_activity
                                </span>
                                Salvando...
                            </>
                        ) : (
                            "Salvar Alterações"
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
