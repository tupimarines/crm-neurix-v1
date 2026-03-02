"use client";

import { useState } from "react";

export default function ConfiguracoesPage() {
    const [activeColor, setActiveColor] = useState("#8b5cf6");
    const [pendingColor, setPendingColor] = useState("#8b5cf6");
    const [showDashboardEdit, setShowDashboardEdit] = useState(false);
    const [showFunnelStats, setShowFunnelStats] = useState(false);
    const [showProductsPanel, setShowProductsPanel] = useState(false);
    const [aiEnabled, setAiEnabled] = useState(true);
    const [nfEnabled, setNfEnabled] = useState(false);
    const [systemPromptExtra, setSystemPromptExtra] = useState("");
    const [whatsappConnected] = useState(true);

    // Dashboard metrics toggles
    const [dashMetrics, setDashMetrics] = useState({
        conversao: true, faturamento: true, contatos: true,
        pedidosRecentes: true, produtosMaisVendidos: false, msgPorDia: false,
    });

    const modules = [
        { icon: "dashboard", name: "Painel Principal", desc: "Visualização geral de métricas", action: () => setShowDashboardEdit(true) },
        { icon: "trending_up", name: "Funil de Vendas", desc: "Gestão de leads e oportunidades", action: () => setShowFunnelStats(true) },
        { icon: "inventory_2", name: "Produtos", desc: "Catálogo de geleias e insumos", action: () => setShowProductsPanel(true) },
    ];

    const colorOptions = [
        { value: "#8b5cf6", label: "Roxo" },
        { value: "#E11D48", label: "Rosa" },
        { value: "#DC2626", label: "Vermelho" },
        { value: "#2563EB", label: "Azul Royal" },
        { value: "#D97706", label: "Dourado" },
    ];

    function applyColor() {
        setActiveColor(pendingColor);
        // In a real app, this would persist to CSS variables or API
        document.documentElement.style.setProperty("--color-primary", pendingColor);
    }

    return (
        <div className="p-8 overflow-y-auto h-full">
            <div className="max-w-[960px] mx-auto flex flex-col gap-8 pb-12">
                {/* Header */}
                <div className="flex flex-col gap-2">
                    <h1 className="text-3xl font-extrabold font-display tracking-tight">Configurações</h1>
                    <p className="text-text-secondary-light dark:text-text-secondary-dark text-base">
                        Gerencie seus módulos, integrações e preferências do sistema.
                    </p>
                </div>

                {/* Module Management */}
                <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-bold">Gerenciar Módulos</h2>
                        <button className="text-primary text-sm font-medium hover:underline">Restaurar padrões</button>
                    </div>
                    <div className="bg-surface-light dark:bg-surface-dark rounded-xl shadow-sm border border-border-light dark:border-border-dark overflow-hidden">
                        {modules.map((mod, i) => (
                            <div key={mod.name}
                                className={`flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${i < modules.length - 1 ? "border-b border-border-light dark:border-border-dark" : ""}`}>
                                <div className="flex items-center gap-4">
                                    <div className="flex items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0 w-10 h-10">
                                        <span className="material-symbols-outlined">{mod.icon}</span>
                                    </div>
                                    <div><span className="font-medium text-sm">{mod.name}</span><br /><span className="text-text-secondary-light text-xs">{mod.desc}</span></div>
                                </div>
                                <button onClick={mod.action} className="p-2 rounded-full text-text-secondary-light hover:text-primary hover:bg-primary/10 transition-all">
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
                        <div className="flex items-center justify-between flex-wrap gap-4">
                            <div className="flex flex-col gap-1">
                                <span className="font-medium text-sm">Paleta de Cores</span>
                                <p className="text-text-secondary-light text-xs">Escolha a cor principal da interface</p>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800/50 p-2 rounded-full border border-border-light dark:border-border-dark">
                                    {colorOptions.map((c) => (
                                        <button key={c.value} onClick={() => setPendingColor(c.value)}
                                            className={`rounded-full transition-all hover:scale-110 ${pendingColor === c.value ? "w-8 h-8 ring-2 ring-offset-2 ring-primary" : "w-6 h-6"}`}
                                            style={{ backgroundColor: c.value }} title={c.label} />
                                    ))}
                                </div>
                                <button onClick={applyColor}
                                    disabled={pendingColor === activeColor}
                                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${pendingColor !== activeColor ? "bg-primary text-white hover:bg-primary-hover shadow-lg shadow-primary/30" : "bg-slate-100 dark:bg-slate-800 text-text-secondary-light cursor-not-allowed"}`}>
                                    Aplicar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Integrations */}
                <div className="flex flex-col gap-4">
                    <h2 className="text-lg font-bold">Integrações</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* WhatsApp */}
                        <div className="bg-surface-light dark:bg-surface-dark rounded-xl shadow-sm border border-border-light dark:border-border-dark p-5 space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 flex items-center justify-center">
                                    <span className="material-symbols-outlined">chat</span>
                                </div>
                                <div className="flex-1">
                                    <h3 className="font-semibold text-sm">WhatsApp Business</h3>
                                    <p className="text-xs text-text-secondary-light">
                                        Status: <span className={`font-medium ${whatsappConnected ? "text-green-600" : "text-red-500"}`}>{whatsappConnected ? "Conectado" : "Desconectado"}</span>
                                    </p>
                                </div>
                                <div className={`w-3 h-3 rounded-full ${whatsappConnected ? "bg-green-500" : "bg-red-500"} animate-pulse`} />
                            </div>
                            {/* AI Agent toggle */}
                            <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-border-light dark:border-border-dark">
                                <div className="flex items-center justify-between mb-3">
                                    <div>
                                        <span className="font-medium text-sm">Agente de IA</span>
                                        <p className="text-xs text-text-secondary-light mt-0.5">Ativar respostas automáticas com IA</p>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input checked={aiEnabled} onChange={(e) => setAiEnabled(e.target.checked)} className="sr-only peer" type="checkbox" />
                                        <div className="w-11 h-6 bg-slate-200 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary" />
                                    </label>
                                </div>
                                {aiEnabled && (
                                    <div>
                                        <label className="text-xs font-semibold text-text-secondary-light uppercase tracking-wider mb-1 block">Informações adicionais para o prompt</label>
                                        <textarea value={systemPromptExtra} onChange={(e) => setSystemPromptExtra(e.target.value)}
                                            className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-border-light dark:border-border-dark rounded-lg text-sm focus:ring-1 focus:ring-primary resize-none"
                                            rows={3} placeholder="Ex: Promoção de Natal: 20% de desconto. Não temos geleia de uva no momento..." />
                                        <p className="text-[10px] text-text-secondary-light mt-1">Datas comemorativas, ofertas, informações do negócio</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Nota Fiscal */}
                        <div className="bg-surface-light dark:bg-surface-dark rounded-xl shadow-sm border border-border-light dark:border-border-dark p-5 space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 flex items-center justify-center">
                                    <span className="material-symbols-outlined">receipt_long</span>
                                </div>
                                <div className="flex-1">
                                    <h3 className="font-semibold text-sm">Emissão de Nota Fiscal</h3>
                                    <p className="text-xs text-text-secondary-light">Integração com API de NF-e</p>
                                </div>
                            </div>
                            <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-border-light dark:border-border-dark">
                                <div className="flex items-center justify-between mb-3">
                                    <div>
                                        <span className="font-medium text-sm">Emissão Automática</span>
                                        <p className="text-xs text-text-secondary-light mt-0.5">Gerar NF-e ao confirmar pagamento</p>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input checked={nfEnabled} onChange={(e) => setNfEnabled(e.target.checked)} className="sr-only peer" type="checkbox" />
                                        <div className="w-11 h-6 bg-slate-200 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary" />
                                    </label>
                                </div>
                                <button className="w-full px-3 py-2 border border-border-light dark:border-border-dark rounded-lg text-sm font-medium text-text-secondary-light hover:border-primary hover:text-primary transition-colors flex items-center justify-center gap-2">
                                    <span className="material-symbols-outlined text-base">network_check</span>
                                    Testar Conectividade
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="mt-8 border-t border-border-light dark:border-border-dark pt-6 flex flex-col md:flex-row justify-between items-center text-xs text-text-secondary-light">
                    <p>© 2026 — Neurix IA</p>
                    <div className="flex gap-4 mt-2 md:mt-0">
                        <a className="hover:text-primary transition-colors" href="#">Documentação</a>
                        <a className="hover:text-primary transition-colors" href="#">Suporte</a>
                        <a className="hover:text-primary transition-colors" href="#">Termos de Uso</a>
                    </div>
                </div>
            </div>

            {/* Dashboard Edit Modal */}
            {showDashboardEdit && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={() => setShowDashboardEdit(false)} />
                    <div className="relative bg-surface-light dark:bg-surface-dark rounded-2xl shadow-2xl border border-border-light dark:border-border-dark w-full max-w-md">
                        <div className="p-6 border-b border-border-light dark:border-border-dark flex justify-between">
                            <h3 className="text-lg font-bold font-display">Editar Painel Principal</h3>
                            <button onClick={() => setShowDashboardEdit(false)}><span className="material-symbols-outlined text-text-secondary-light">close</span></button>
                        </div>
                        <div className="p-6 space-y-3">
                            <p className="text-sm text-text-secondary-light mb-4">Escolha quais métricas aparecem no dashboard:</p>
                            {[
                                { key: "conversao", label: "Taxa de Conversão" },
                                { key: "faturamento", label: "Faturamento Mensal" },
                                { key: "contatos", label: "Novos Contatos" },
                                { key: "pedidosRecentes", label: "Últimos Pedidos" },
                                { key: "produtosMaisVendidos", label: "Produtos Mais Vendidos" },
                                { key: "msgPorDia", label: "Mensagens por Dia" },
                            ].map(({ key, label }) => (
                                <label key={key} className="flex items-center justify-between py-2 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 px-3 rounded-lg transition-colors">
                                    <span className="text-sm font-medium">{label}</span>
                                    <input type="checkbox" checked={dashMetrics[key as keyof typeof dashMetrics]}
                                        onChange={(e) => setDashMetrics({ ...dashMetrics, [key]: e.target.checked })}
                                        className="w-4 h-4 text-primary rounded border-border-light focus:ring-primary" />
                                </label>
                            ))}
                        </div>
                        <div className="p-4 border-t border-border-light dark:border-border-dark">
                            <button onClick={() => setShowDashboardEdit(false)} className="w-full py-2.5 bg-primary text-white rounded-xl font-medium hover:bg-primary-hover transition-all">Salvar</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Funnel Stats Modal */}
            {showFunnelStats && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={() => setShowFunnelStats(false)} />
                    <div className="relative bg-surface-light dark:bg-surface-dark rounded-2xl shadow-2xl border border-border-light dark:border-border-dark w-full max-w-md">
                        <div className="p-6 border-b border-border-light dark:border-border-dark flex justify-between">
                            <h3 className="text-lg font-bold font-display">Funil de Vendas</h3>
                            <button onClick={() => setShowFunnelStats(false)}><span className="material-symbols-outlined text-text-secondary-light">close</span></button>
                        </div>
                        <div className="p-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl text-center">
                                    <p className="text-xs text-text-secondary-light uppercase font-medium">Conversas Iniciadas</p>
                                    <p className="text-2xl font-bold mt-1">127</p>
                                </div>
                                <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl text-center">
                                    <p className="text-xs text-text-secondary-light uppercase font-medium">Tempo Médio IA</p>
                                    <p className="text-2xl font-bold mt-1">2.3s</p>
                                </div>
                                <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl text-center">
                                    <p className="text-xs text-text-secondary-light uppercase font-medium">Novos Pedidos</p>
                                    <p className="text-2xl font-bold mt-1 text-green-600">34</p>
                                </div>
                                <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl text-center">
                                    <p className="text-xs text-text-secondary-light uppercase font-medium">Pagam. Confirmados</p>
                                    <p className="text-2xl font-bold mt-1 text-primary">28</p>
                                </div>
                            </div>
                            <div className="mt-5 p-4 bg-primary/5 rounded-xl border border-primary/20">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium">Conversão Geral</span>
                                    <span className="text-xl font-bold text-primary">22.0%</span>
                                </div>
                                <div className="mt-2 h-2 bg-slate-100 dark:bg-slate-700 rounded-full">
                                    <div className="h-full bg-primary rounded-full" style={{ width: "22%" }} />
                                </div>
                            </div>
                        </div>
                        <div className="p-4 border-t border-border-light dark:border-border-dark">
                            <button onClick={() => setShowFunnelStats(false)} className="w-full py-2.5 bg-primary text-white rounded-xl font-medium hover:bg-primary-hover transition-all">Fechar</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Products Panel Modal */}
            {showProductsPanel && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={() => setShowProductsPanel(false)} />
                    <div className="relative bg-surface-light dark:bg-surface-dark rounded-2xl shadow-2xl border border-border-light dark:border-border-dark w-full max-w-md">
                        <div className="p-6 border-b border-border-light dark:border-border-dark flex justify-between">
                            <h3 className="text-lg font-bold font-display">Gerenciar Produtos</h3>
                            <button onClick={() => setShowProductsPanel(false)}><span className="material-symbols-outlined text-text-secondary-light">close</span></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <a href="/produtos" className="block p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-border-light dark:border-border-dark hover:border-primary transition-colors group">
                                <div className="flex items-center gap-3">
                                    <span className="material-symbols-outlined text-primary text-xl">inventory_2</span>
                                    <div>
                                        <p className="font-medium text-sm group-hover:text-primary transition-colors">Catálogo de Produtos</p>
                                        <p className="text-xs text-text-secondary-light">Gerenciar produtos, preços e estoque</p>
                                    </div>
                                    <span className="material-symbols-outlined text-text-secondary-light ml-auto">arrow_forward</span>
                                </div>
                            </a>
                            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-border-light dark:border-border-dark">
                                <div className="flex items-center gap-3 mb-3">
                                    <span className="material-symbols-outlined text-primary text-xl">category</span>
                                    <div>
                                        <p className="font-medium text-sm">Categorias</p>
                                        <p className="text-xs text-text-secondary-light">Gerenciar categorias de produtos</p>
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {["Tradicional", "Diet / Zero", "Gourmet", "Sazonal"].map((c) => (
                                        <span key={c} className="px-3 py-1 bg-primary-light dark:bg-primary/20 text-primary text-xs font-medium rounded-full">{c}</span>
                                    ))}
                                </div>
                            </div>
                            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-border-light dark:border-border-dark">
                                <div className="flex items-center gap-3">
                                    <span className="material-symbols-outlined text-primary text-xl">local_shipping</span>
                                    <div>
                                        <p className="font-medium text-sm">Lotes</p>
                                        <p className="text-xs text-text-secondary-light">Gerenciar lotes de produção</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="p-4 border-t border-border-light dark:border-border-dark">
                            <button onClick={() => setShowProductsPanel(false)} className="w-full py-2.5 bg-primary text-white rounded-xl font-medium hover:bg-primary-hover transition-all">Fechar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
