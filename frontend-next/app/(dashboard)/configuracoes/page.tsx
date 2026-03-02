"use client";

import { useState } from "react";

export default function ConfiguracoesPage() {
    const [activeColor, setActiveColor] = useState("#8b5cf6");

    const modules = [
        { icon: "dashboard", name: "Painel Principal", desc: "Visualização geral de métricas" },
        { icon: "trending_up", name: "Funil de Vendas", desc: "Gestão de leads e oportunidades" },
        { icon: "inventory_2", name: "Produtos", desc: "Catálogo de geleias e insumos" },
    ];

    const colorOptions = [
        { value: "#8b5cf6", label: "Roxo" },
        { value: "#E11D48", label: "Rosa" },
        { value: "#DC2626", label: "Vermelho" },
        { value: "#2563EB", label: "Azul Royal" },
        { value: "#D97706", label: "Dourado" },
    ];

    return (
        <div className="p-8 overflow-y-auto h-full">
            <div className="max-w-[960px] mx-auto flex flex-col gap-8 pb-12">
                {/* Header */}
                <div className="flex flex-col gap-2">
                    <h1 className="text-3xl font-extrabold font-display tracking-tight">
                        Configurações
                    </h1>
                    <p className="text-text-secondary-light dark:text-text-secondary-dark text-base">
                        Gerencie seus módulos, integrações e preferências do sistema.
                    </p>
                </div>

                {/* Module Management */}
                <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-bold">Gerenciar Módulos</h2>
                        <button className="text-primary text-sm font-medium hover:underline">
                            Restaurar padrões
                        </button>
                    </div>
                    <div className="bg-surface-light dark:bg-surface-dark rounded-xl shadow-sm border border-border-light dark:border-border-dark overflow-hidden">
                        {modules.map((mod, i) => (
                            <div
                                key={mod.name}
                                className={`flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${i < modules.length - 1 ? "border-b border-border-light dark:border-border-dark" : ""
                                    }`}
                            >
                                <div className="flex items-center gap-4">
                                    <div className="flex items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0 w-10 h-10">
                                        <span className="material-symbols-outlined">{mod.icon}</span>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="font-medium text-sm">{mod.name}</span>
                                        <span className="text-text-secondary-light text-xs">{mod.desc}</span>
                                    </div>
                                </div>
                                <button className="p-2 rounded-full text-text-secondary-light hover:text-primary hover:bg-primary/10 transition-all">
                                    <span className="material-symbols-outlined text-[20px]">edit</span>
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Color Customization */}
                <div className="flex flex-col gap-4">
                    <h2 className="text-lg font-bold">Customização Visual</h2>
                    <div className="bg-surface-light dark:bg-surface-dark rounded-xl shadow-sm border border-border-light dark:border-border-dark p-5">
                        <div className="flex items-center justify-between">
                            <div className="flex flex-col gap-1">
                                <span className="font-medium text-sm">Paleta de Cores</span>
                                <p className="text-text-secondary-light text-xs">
                                    Escolha a cor principal da interface
                                </p>
                            </div>
                            <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800/50 p-2 rounded-full border border-border-light dark:border-border-dark">
                                {colorOptions.map((c) => (
                                    <button
                                        key={c.value}
                                        onClick={() => setActiveColor(c.value)}
                                        className={`rounded-full transition-all hover:scale-110 ${activeColor === c.value
                                                ? "w-8 h-8 ring-2 ring-offset-2 ring-primary"
                                                : "w-6 h-6"
                                            }`}
                                        style={{ backgroundColor: c.value }}
                                        title={c.label}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* API Integrations + Database */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* WhatsApp */}
                    <div className="flex flex-col gap-4">
                        <h2 className="text-lg font-bold">Integrações API</h2>
                        <div className="bg-surface-light dark:bg-surface-dark rounded-xl shadow-sm border border-border-light dark:border-border-dark p-5 flex flex-col gap-4 h-full">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 flex items-center justify-center">
                                    <span className="material-symbols-outlined">chat</span>
                                </div>
                                <div>
                                    <h3 className="font-semibold text-sm">WhatsApp Business (Uazapi)</h3>
                                    <p className="text-text-secondary-light text-xs">
                                        Status: <span className="text-green-600 font-medium">Conectado</span>
                                    </p>
                                </div>
                                <div className="ml-auto">
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input defaultChecked className="sr-only peer" type="checkbox" />
                                        <div className="w-11 h-6 bg-slate-200 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary" />
                                    </label>
                                </div>
                            </div>
                            <div className="mt-2 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg border border-border-light dark:border-border-dark">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-xs text-text-secondary-light font-medium">API Key</span>
                                    <span className="text-xs text-primary cursor-pointer hover:underline">Gerar nova</span>
                                </div>
                                <code className="text-xs text-text-secondary-light font-mono break-all">
                                    wz_live_89234...90a8
                                </code>
                            </div>
                        </div>
                    </div>

                    {/* Database */}
                    <div className="flex flex-col gap-4">
                        <h2 className="text-lg font-bold">Banco de Dados</h2>
                        <div className="bg-surface-light dark:bg-surface-dark rounded-xl shadow-sm border border-border-light dark:border-border-dark p-5 flex flex-col gap-4 h-full">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 flex items-center justify-center">
                                    <span className="material-symbols-outlined">database</span>
                                </div>
                                <div>
                                    <h3 className="font-semibold text-sm">PostgreSQL Cluster</h3>
                                    <p className="text-text-secondary-light text-xs">Supabase • us-east-1</p>
                                </div>
                                <div className="ml-auto">
                                    <button className="p-2 rounded-full text-text-secondary-light hover:text-primary hover:bg-primary/10 transition-all">
                                        <span className="material-symbols-outlined text-[20px]">settings</span>
                                    </button>
                                </div>
                            </div>
                            <div className="flex flex-col gap-2 mt-2">
                                <div className="flex justify-between items-center text-xs">
                                    <span className="text-text-secondary-light">Armazenamento</span>
                                    <span className="font-bold">45.2 GB / 100 GB</span>
                                </div>
                                <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-1.5">
                                    <div className="bg-primary h-1.5 rounded-full" style={{ width: "45%" }} />
                                </div>
                            </div>
                            <div className="flex gap-2 mt-auto pt-2">
                                <button className="flex-1 py-2 px-3 bg-surface-light dark:bg-slate-800 border border-border-light dark:border-border-dark rounded-lg text-xs font-medium text-text-secondary-light hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                                    Backup Manual
                                </button>
                                <button className="flex-1 py-2 px-3 bg-surface-light dark:bg-slate-800 border border-border-light dark:border-border-dark rounded-lg text-xs font-medium text-text-secondary-light hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                                    Logs de Acesso
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="mt-8 border-t border-border-light dark:border-border-dark pt-6 flex flex-col md:flex-row justify-between items-center text-xs text-text-secondary-light">
                    <p>© 2024 Neurix CRM System. Todos os direitos reservados.</p>
                    <div className="flex gap-4 mt-2 md:mt-0">
                        <a className="hover:text-primary transition-colors" href="#">Documentação</a>
                        <a className="hover:text-primary transition-colors" href="#">Suporte</a>
                        <a className="hover:text-primary transition-colors" href="#">Termos de Uso</a>
                    </div>
                </div>
            </div>
        </div>
    );
}
