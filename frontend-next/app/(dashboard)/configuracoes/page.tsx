"use client";

import { useState, useEffect } from "react";
import { getWhatsappStatus, initWhatsappInstance, connectWhatsappInstance, saveWhatsappToken, disconnectWhatsappInstance } from "@/lib/api";

export default function ConfiguracoesPage() {
    const [activeColor, setActiveColor] = useState("#8b5cf6");
    const [pendingColor, setPendingColor] = useState("#8b5cf6");
    const [showDashboardEdit, setShowDashboardEdit] = useState(false);
    const [showFunnelStats, setShowFunnelStats] = useState(false);
    const [showProductsPanel, setShowProductsPanel] = useState(false);
    const [aiEnabled, setAiEnabled] = useState(true);
    const [nfEnabled, setNfEnabled] = useState(false);
    const [systemPromptExtra, setSystemPromptExtra] = useState("");

    // WhatsApp Integration States
    const [whatsappStatus, setWhatsappStatus] = useState<string>("Buscando...");
    const [showWhatsappModal, setShowWhatsappModal] = useState(false);
    const [whatsappModalTab, setWhatsappModalTab] = useState<"qr" | "manual">("qr");
    const [qrCodeBase64, setQrCodeBase64] = useState<string>("");
    const [manualToken, setManualToken] = useState("");
    const [instanceNameInput, setInstanceNameInput] = useState("crm_neurix");
    const [isLoadingWhatsapp, setIsLoadingWhatsapp] = useState(false);
    const [isPolling, setIsPolling] = useState(false);

    // Fetch initial status
    useEffect(() => {
        fetchStatus();
    }, []);

    const fetchStatus = async () => {
        try {
            const token = localStorage.getItem("access_token") || undefined;
            const res = await getWhatsappStatus(token);
            setWhatsappStatus(res.status);
            // In Uazapi the status is typically 'open' or 'connecting'
            if (res.status === "connecting" && !isPolling) {
                // If connecting, we should poll. But polling is handled by a separate effect or interval if modal open
            }
        } catch (error) {
            console.error("Failed to fetch whatsapp status", error);
            setWhatsappStatus("disconnected");
        }
    };

    // Polling logic when connecting or unknown
    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (isPolling || whatsappStatus === "connecting" || whatsappStatus === "unknown") {
            interval = setInterval(async () => {
                try {
                    const token = localStorage.getItem("access_token") || undefined;
                    const res = await getWhatsappStatus(token);
                    setWhatsappStatus(res.status);
                    if (res.status === "open" || res.status === "connected") {
                        setIsPolling(false);
                        setShowWhatsappModal(false);
                        setQrCodeBase64("");
                    } else if (res.status === "disconnected") {
                        setIsPolling(false);
                    }
                } catch (e) {
                    setIsPolling(false);
                }
            }, 3000);
        }
        return () => clearInterval(interval);
    }, [isPolling, whatsappStatus]);

    const handleInitInstance = async () => {
        if (!instanceNameInput.trim()) return;
        setIsLoadingWhatsapp(true);
        try {
            const token = localStorage.getItem("access_token") || undefined;
            await initWhatsappInstance(instanceNameInput.trim(), token);
            await fetchStatus();
        } catch (error: any) {
            console.error(error);
            alert(error.message || "Erro ao inicializar instância.");
        } finally {
            setIsLoadingWhatsapp(false);
        }
    };

    const applyQrResponse = (res: any) => {
        const qrString = res.data?.base64 || res.data?.qrcode || res.data?.instance?.qrcode;

        if (qrString) {
            setQrCodeBase64(qrString);
            setIsPolling(true);
            setWhatsappStatus("connecting");
            return;
        }

        if (res.data?.instance?.state === "open" || res.data?.instance?.state === "connected") {
            setWhatsappStatus("open");
            setShowWhatsappModal(false);
            return;
        }

        if (res.data?.instance?.state === "connecting" || res.data?.state === "connecting") {
            setWhatsappStatus("connecting");
            setIsPolling(true);
        }
    };

    const handleGenerateQR = async () => {
        setIsLoadingWhatsapp(true);
        try {
            const token = localStorage.getItem("access_token") || undefined;
            try {
                const res = await connectWhatsappInstance(token);
                applyQrResponse(res);
            } catch (error: any) {
                const msg = error instanceof Error ? error.message : String(error || "");
                const needsInit = /nenhum token configurado|crie uma instância/i.test(msg);
                if (!needsInit) throw error;

                if (!instanceNameInput.trim()) {
                    throw new Error("Informe um nome de instância e clique em Criar Instância antes de gerar o QR.");
                }

                await initWhatsappInstance(instanceNameInput.trim(), token);
                const res = await connectWhatsappInstance(token);
                applyQrResponse(res);
            }
        } catch (error: any) {
            console.error(error);
            alert(error?.message || "Erro ao gerar QR Code");
        } finally {
            setIsLoadingWhatsapp(false);
        }
    };

    const handleSaveManualToken = async () => {
        if (!manualToken) return;
        setIsLoadingWhatsapp(true);
        try {
            const token = localStorage.getItem("access_token") || undefined;
            await saveWhatsappToken(manualToken, token);
            await fetchStatus();
            setShowWhatsappModal(false);
            setManualToken("");
        } catch (error) {
            alert("Erro ao salvar token manual");
        } finally {
            setIsLoadingWhatsapp(false);
        }
    };

    const handleDisconnectWhatsapp = async () => {
        if (!confirm("Tem certeza que deseja excluir esta configuração?")) return;
        setIsLoadingWhatsapp(true);
        try {
            const token = localStorage.getItem("access_token") || undefined;
            await disconnectWhatsappInstance(token);
            setWhatsappStatus("disconnected");
            setIsPolling(false);
            setQrCodeBase64("");
            setInstanceNameInput("crm_neurix");
        } catch (error) {
            alert("Erro ao excluir configuração");
        } finally {
            setIsLoadingWhatsapp(false);
        }
    };

    const isConnected = whatsappStatus === "open" || whatsappStatus === "connected";
    const isConfigured = whatsappStatus !== "disconnected" && whatsappStatus !== "Buscando...";

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
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isConnected ? "bg-green-100 dark:bg-green-900/30 text-green-600" : "bg-slate-100 dark:bg-slate-800 text-slate-500"}`}>
                                    <span className="material-symbols-outlined">chat</span>
                                </div>
                                <div className="flex-1">
                                    <h3 className="font-semibold text-sm">WhatsApp Business</h3>
                                    <p className="text-xs text-text-secondary-light">
                                        Status: <span className={`font-medium ${isConnected ? "text-green-600" : (whatsappStatus === "connecting" ? "text-yellow-600" : "text-red-500")}`}>{whatsappStatus === "open" ? "Conectado" : whatsappStatus}</span>
                                    </p>
                                </div>
                                <div className="flex flex-col items-end gap-2">
                                    <div className={`w-3 h-3 rounded-full ${isConnected ? "bg-green-500" : "bg-red-500"} ${whatsappStatus === "connecting" ? "animate-pulse bg-yellow-500" : ""}`} />
                                </div>
                            </div>
                            <button onClick={() => setShowWhatsappModal(true)} className="w-full mt-2 py-2 px-3 text-sm font-medium border border-border-light dark:border-border-dark rounded-lg hover:border-primary hover:text-primary transition-colors">
                                Configurar Conexão
                            </button>
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    onClick={() => { setWhatsappModalTab("qr"); setShowWhatsappModal(true); }}
                                    className="w-full py-2 px-3 text-xs font-semibold rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                                >
                                    Criar Instância
                                </button>
                                <button
                                    onClick={() => { setWhatsappModalTab("qr"); setShowWhatsappModal(true); }}
                                    className="w-full py-2 px-3 text-xs font-semibold rounded-lg border border-border-light dark:border-border-dark hover:border-primary hover:text-primary transition-colors"
                                >
                                    Gerar QR Code
                                </button>
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

            {/* WhatsApp Integration Modal */}
            {showWhatsappModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={() => !isLoadingWhatsapp && setShowWhatsappModal(false)} />
                    <div className="relative bg-surface-light dark:bg-surface-dark rounded-2xl shadow-2xl border border-border-light dark:border-border-dark w-full max-w-md flex flex-col max-h-[90vh]">
                        <div className="p-6 border-b border-border-light dark:border-border-dark flex justify-between shrink-0">
                            <h3 className="text-lg font-bold font-display">Conexão WhatsApp Uazapi</h3>
                            <button onClick={() => !isLoadingWhatsapp && setShowWhatsappModal(false)} disabled={isLoadingWhatsapp}><span className="material-symbols-outlined text-text-secondary-light hover:text-text-primary-light transition-colors">close</span></button>
                        </div>

                        <div className="p-6 overflow-y-auto space-y-6">
                            {/* Tabs */}
                            <div className="flex rounded-lg bg-slate-100 dark:bg-slate-800 p-1">
                                <button
                                    className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${whatsappModalTab === "qr" ? "bg-white dark:bg-slate-700 shadow-sm text-primary" : "text-text-secondary-light hover:text-text-primary-light"}`}
                                    onClick={() => setWhatsappModalTab("qr")}
                                >
                                    QR Code
                                </button>
                                <button
                                    className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${whatsappModalTab === "manual" ? "bg-white dark:bg-slate-700 shadow-sm text-primary" : "text-text-secondary-light hover:text-text-primary-light"}`}
                                    onClick={() => setWhatsappModalTab("manual")}
                                >
                                    Token Manual
                                </button>
                            </div>

                            {/* Status Banner */}
                            <div className={`p-3 rounded-lg border flex items-center gap-3 ${isConnected ? "bg-green-50 border-green-200 text-green-700 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400" : "bg-slate-50 border-slate-200 text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300"}`}>
                                <span className="material-symbols-outlined">{isConnected ? "check_circle" : "info"}</span>
                                <div className="text-sm">
                                    <p className="font-semibold">Status Atual: {whatsappStatus === "open" ? "Conectado" : whatsappStatus}</p>
                                    <p className="text-xs opacity-80">{isConnected ? "Sua instância está pronta para enviar e receber mensagens." : "Conecte sua instância para habilitar mensagens."}</p>
                                </div>
                            </div>

                            {/* Content QR */}
                            {whatsappModalTab === "qr" && (
                                <div className="flex flex-col items-center gap-4 text-center">
                                    <div className="w-full p-4 rounded-xl border border-border-light dark:border-border-dark bg-slate-50 dark:bg-slate-800/50 space-y-3 text-left">
                                        <p className="text-sm text-text-secondary-light">
                                            Crie ou recupere a instância antes de gerar o QR Code.
                                        </p>
                                        <div>
                                            <label className="text-xs font-semibold text-text-secondary-light uppercase tracking-wider mb-1 block">Nome da Instância</label>
                                            <input
                                                type="text"
                                                value={instanceNameInput}
                                                onChange={(e) => setInstanceNameInput(e.target.value)}
                                                placeholder="Ex: crm_neurix"
                                                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-border-light dark:border-border-dark rounded-lg text-sm focus:ring-1 focus:ring-primary outline-none"
                                            />
                                        </div>
                                        <button
                                            onClick={handleInitInstance}
                                            disabled={isLoadingWhatsapp || !instanceNameInput.trim()}
                                            className="w-full px-6 py-2.5 bg-primary text-white rounded-lg font-medium hover:bg-primary-hover disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                                        >
                                            {isLoadingWhatsapp ? <span className="material-symbols-outlined animate-spin">refresh</span> : <span className="material-symbols-outlined">add_circle</span>}
                                            Criar Instância
                                        </button>
                                    </div>

                                    <p className="text-sm text-text-secondary-light">
                                        Para conectar, clique em "Gerar" e leia o QR Code com o WhatsApp do seu celular (Aparelhos Conectados).
                                    </p>

                                    {qrCodeBase64 ? (
                                        <div className="p-4 bg-white rounded-xl border-2 border-primary/20 shadow-inner">
                                            <img src={qrCodeBase64.startsWith('data:image') ? qrCodeBase64 : `data:image/png;base64,${qrCodeBase64}`} alt="WhatsApp QR Code" className="w-48 h-48 object-contain" />
                                            {isPolling && <p className="text-xs text-primary mt-3 animate-pulse">Aguardando leitura do QR Code...</p>}
                                        </div>
                                    ) : (
                                        <div className="w-48 h-48 bg-slate-100 dark:bg-slate-800 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 flex items-center justify-center">
                                            <span className="material-symbols-outlined text-4xl text-slate-400">qr_code_scanner</span>
                                        </div>
                                    )}

                                    <button
                                        onClick={handleGenerateQR}
                                        disabled={isLoadingWhatsapp}
                                        className="px-6 py-2.5 bg-primary text-white rounded-lg font-medium hover:bg-primary-hover disabled:opacity-50 transition-all flex items-center gap-2"
                                    >
                                        {isLoadingWhatsapp ? <span className="material-symbols-outlined animate-spin">refresh</span> : <span className="material-symbols-outlined">sync</span>}
                                        {isConnected ? "Gerar QR Code novamente" : "Gerar Novo QR Code"}
                                    </button>
                                </div>
                            )}

                            {/* Content Manual Token */}
                            {whatsappModalTab === "manual" && (
                                <div className="space-y-4">
                                    <p className="text-sm text-text-secondary-light">
                                        Caso já possua um token de instância Uazapi, você pode inseri-lo manualmente aqui.
                                    </p>
                                    <div>
                                        <label className="text-xs font-semibold text-text-secondary-light uppercase tracking-wider mb-1 block">Token da Instância</label>
                                        <input
                                            type="text"
                                            value={manualToken}
                                            onChange={(e) => setManualToken(e.target.value)}
                                            placeholder="Ex: bd42a2... ou instancename"
                                            className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-border-light dark:border-border-dark rounded-lg text-sm focus:ring-1 focus:ring-primary outline-none"
                                        />
                                    </div>
                                    <button
                                        onClick={handleSaveManualToken}
                                        disabled={isLoadingWhatsapp || !manualToken}
                                        className="w-full py-2.5 bg-primary text-white rounded-lg font-medium hover:bg-primary-hover disabled:opacity-50 transition-all"
                                    >
                                        Salvar Token Manual
                                    </button>
                                </div>
                            )}

                            {/* Danger Zone */}
                            {isConfigured && (
                                <div className="pt-4 border-t border-border-light dark:border-border-dark mt-4">
                                    <button
                                        onClick={handleDisconnectWhatsapp}
                                        disabled={isLoadingWhatsapp}
                                        className="w-full py-2 px-4 rounded-lg border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 dark:border-red-900 dark:text-red-400 dark:bg-red-900/20 dark:hover:bg-red-900/40 text-sm font-medium transition-colors flex items-center justify-center gap-2"
                                    >
                                        <span className="material-symbols-outlined text-base">leak_remove</span>
                                        Excluir Configuração
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
