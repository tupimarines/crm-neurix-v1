"use client";

import { useState, useRef, useEffect } from "react";

export default function DashboardPage() {
    const [showNewOrder, setShowNewOrder] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [showSearch, setShowSearch] = useState(false);
    const [openMenu, setOpenMenu] = useState<number | null>(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState<number | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setOpenMenu(null);
            }
        }
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, []);

    const stats = [
        { icon: "insights", label: "Taxa de Conversão", value: "24.8%", change: "+12.5%", up: true, bar: "24.8%" },
        { icon: "attach_money", label: "Faturamento Mensal", value: "R$ 48.250", change: "+8.2%", up: true, bar: "75%" },
        { icon: "group_add", label: "Novos Contatos", value: "1,204", change: "0.0%", up: false, bar: "45%" },
    ];

    const orders = [
        { initials: "JD", bgClass: "bg-orange-100 dark:bg-orange-900/30", textClass: "text-orange-600 dark:text-orange-400", name: "João da Silva", company: "Supermercado Silva", product: "Geleia de Morango (Cx 12un)", status: "Pago", statusBg: "bg-green-100 dark:bg-green-500/20", statusText: "text-green-700 dark:text-green-400", statusDot: "bg-green-500", total: "R$ 450,00" },
        { initials: "MC", bgClass: "bg-blue-100 dark:bg-blue-900/30", textClass: "text-blue-600 dark:text-blue-400", name: "Maria Clara", company: "Padaria Central", product: "Geleia de Damasco (Cx 6un)", status: "Pendente", statusBg: "bg-yellow-100 dark:bg-yellow-500/20", statusText: "text-yellow-700 dark:text-yellow-400", statusDot: "bg-yellow-500", total: "R$ 180,00" },
        { initials: "EM", bgClass: "bg-purple-100 dark:bg-purple-900/30", textClass: "text-purple-600 dark:text-purple-400", name: "Empório Mineiro", company: "Varejo Gourmet", product: "Mix Frutas Vermelhas (Cx 24un)", status: "Pago", statusBg: "bg-green-100 dark:bg-green-500/20", statusText: "text-green-700 dark:text-green-400", statusDot: "bg-green-500", total: "R$ 890,00" },
        { initials: "CF", bgClass: "bg-pink-100 dark:bg-pink-900/30", textClass: "text-pink-600 dark:text-pink-400", name: "Café Flores", company: "Bistrô", product: "Geleia de Pimenta (Cx 6un)", status: "Cancelado", statusBg: "bg-red-100 dark:bg-red-500/20", statusText: "text-red-700 dark:text-red-400", statusDot: "bg-red-500", total: "R$ 150,00" },
    ];

    return (
        <div className="p-6 lg:p-10 max-w-7xl mx-auto space-y-8">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-display font-bold">Painel de Controle</h1>
                    <p className="text-text-secondary-light dark:text-text-secondary-dark mt-1">
                        Bem-vindo de volta!
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <input
                            value={searchQuery}
                            onChange={(e) => { setSearchQuery(e.target.value); setShowSearch(e.target.value.length > 0); }}
                            onFocus={() => searchQuery.length > 0 && setShowSearch(true)}
                            onBlur={() => setTimeout(() => setShowSearch(false), 200)}
                            className="pl-10 pr-4 py-2 rounded-xl border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark text-sm focus:ring-primary focus:border-primary w-full sm:w-64 shadow-sm"
                            placeholder="Buscar clientes, pedidos, produtos..."
                            type="text"
                        />
                        <span className="material-symbols-outlined absolute left-3 top-2.5 text-text-secondary-light text-lg">
                            search
                        </span>
                        {/* Search dropdown */}
                        {showSearch && (
                            <div className="absolute top-full left-0 right-0 mt-1 bg-surface-light dark:bg-surface-dark rounded-xl shadow-2xl border border-border-light dark:border-border-dark z-50 overflow-hidden">
                                <div className="p-2">
                                    <p className="px-3 py-1 text-[10px] font-semibold text-text-secondary-light uppercase tracking-wider">Clientes</p>
                                    <button className="w-full px-3 py-2 text-sm text-left hover:bg-primary/5 rounded-lg flex items-center gap-2">
                                        <span className="material-symbols-outlined text-base text-text-secondary-light">person</span>
                                        João da Silva
                                    </button>
                                    <p className="px-3 py-1 mt-1 text-[10px] font-semibold text-text-secondary-light uppercase tracking-wider">Pedidos</p>
                                    <button className="w-full px-3 py-2 text-sm text-left hover:bg-primary/5 rounded-lg flex items-center gap-2">
                                        <span className="material-symbols-outlined text-base text-text-secondary-light">receipt_long</span>
                                        Pedido #4092
                                    </button>
                                    <p className="px-3 py-1 mt-1 text-[10px] font-semibold text-text-secondary-light uppercase tracking-wider">Produtos</p>
                                    <button className="w-full px-3 py-2 text-sm text-left hover:bg-primary/5 rounded-lg flex items-center gap-2">
                                        <span className="material-symbols-outlined text-base text-text-secondary-light">inventory_2</span>
                                        Geleia de Morango
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                    <button
                        onClick={() => setShowNewOrder(true)}
                        className="bg-primary hover:bg-primary-hover text-white px-4 py-2 rounded-xl shadow-lg shadow-primary/30 flex items-center gap-2 transition-all text-sm font-medium"
                    >
                        <span className="material-symbols-outlined text-sm">add</span>
                        Novo Pedido
                    </button>
                </div>
            </div>

            {/* Stats Cards — hover-up animation */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {stats.map((stat) => (
                    <div
                        key={stat.label}
                        className="bg-surface-light dark:bg-surface-dark p-6 rounded-2xl shadow-sm border border-border-light/50 dark:border-border-dark relative overflow-hidden group hover:-translate-y-1 hover:shadow-lg transition-all duration-300"
                    >
                        <div className="absolute right-0 top-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                            <span className="material-symbols-outlined text-8xl text-primary">trending_up</span>
                        </div>
                        <div className="flex items-center justify-between mb-4">
                            <div className="p-2 bg-primary-light dark:bg-primary/10 rounded-lg text-primary">
                                <span className="material-symbols-outlined text-xl">{stat.icon}</span>
                            </div>
                            <span
                                className={`${stat.up ? "text-green-500 bg-green-50 dark:bg-green-500/10" : "text-slate-400 bg-slate-50 dark:bg-slate-700/30"} px-2 py-1 rounded text-xs font-semibold flex items-center gap-1`}
                            >
                                {stat.change}
                                <span className="material-symbols-outlined text-xs">{stat.up ? "arrow_upward" : "remove"}</span>
                            </span>
                        </div>
                        <h3 className="text-text-secondary-light dark:text-text-secondary-dark text-sm font-medium uppercase tracking-wide">
                            {stat.label}
                        </h3>
                        <p className="text-3xl font-display font-bold mt-1">{stat.value}</p>
                        <div className="mt-4 h-1.5 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                            <div className="h-full bg-primary rounded-full" style={{ width: stat.bar }} />
                        </div>
                    </div>
                ))}
            </div>

            {/* Orders Table */}
            <div className="bg-surface-light dark:bg-surface-dark rounded-2xl shadow-sm border border-border-light dark:border-border-dark overflow-hidden">
                <div className="p-6 border-b border-border-light dark:border-border-dark flex items-center justify-between">
                    <h2 className="text-lg font-display font-semibold">Últimos Pedidos</h2>
                    <button className="text-sm text-primary font-medium hover:text-primary-hover flex items-center gap-1">
                        Ver todos <span className="material-symbols-outlined text-sm">arrow_forward</span>
                    </button>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 dark:bg-slate-800/50 text-text-secondary-light dark:text-text-secondary-dark uppercase tracking-wider text-xs font-semibold">
                            <tr>
                                <th className="px-6 py-4">Cliente</th>
                                <th className="px-6 py-4">Produto</th>
                                <th className="px-6 py-4">Status Pagamento</th>
                                <th className="px-6 py-4">Total</th>
                                <th className="px-6 py-4 text-right">Ação</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border-light dark:divide-border-dark">
                            {orders.map((order, i) => (
                                <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors group">
                                    <td className="px-6 py-4 font-medium flex items-center gap-3">
                                        <div className={`h-8 w-8 rounded-full ${order.bgClass} ${order.textClass} flex items-center justify-center text-xs font-bold`}>
                                            {order.initials}
                                        </div>
                                        <div>
                                            <p>{order.name}</p>
                                            <p className="text-xs text-text-secondary-light dark:text-text-secondary-dark font-normal">{order.company}</p>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-text-secondary-light dark:text-text-secondary-dark">{order.product}</td>
                                    <td className="px-6 py-4">
                                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${order.statusBg} ${order.statusText}`}>
                                            <span className={`w-1.5 h-1.5 rounded-full ${order.statusDot}`} />
                                            {order.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 font-medium">{order.total}</td>
                                    <td className="px-6 py-4 text-right relative">
                                        <div ref={openMenu === i ? menuRef : null}>
                                            <button className="text-green-600 hover:text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-500/10 p-2 rounded-lg transition-colors">
                                                <span className="material-symbols-outlined text-lg">chat</span>
                                            </button>
                                            <button
                                                onClick={() => setOpenMenu(openMenu === i ? null : i)}
                                                className="text-text-secondary-light hover:text-primary dark:text-text-secondary-dark p-2 ml-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                                            >
                                                <span className="material-symbols-outlined text-lg">more_vert</span>
                                            </button>
                                            {/* Dropdown menu */}
                                            {openMenu === i && (
                                                <div className="absolute right-0 top-full mt-1 w-48 bg-surface-light dark:bg-surface-dark rounded-xl shadow-2xl border border-border-light dark:border-border-dark z-50 py-1 text-left">
                                                    <button className="w-full px-4 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 text-text-main-light dark:text-text-main-dark">
                                                        <span className="material-symbols-outlined text-base">visibility</span>
                                                        Visualizar Pedido
                                                    </button>
                                                    <button className="w-full px-4 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 text-text-main-light dark:text-text-main-dark">
                                                        <span className="material-symbols-outlined text-base">archive</span>
                                                        Arquivar
                                                    </button>
                                                    <div className="h-px bg-border-light dark:bg-border-dark mx-2 my-1" />
                                                    {showDeleteConfirm === i ? (
                                                        <div className="px-4 py-2">
                                                            <p className="text-xs text-red-600 mb-2">Confirmar exclusão?</p>
                                                            <div className="flex gap-2">
                                                                <button
                                                                    onClick={() => { setShowDeleteConfirm(null); setOpenMenu(null); }}
                                                                    className="flex-1 px-2 py-1 text-xs bg-red-500 text-white rounded-lg hover:bg-red-600"
                                                                >
                                                                    Excluir
                                                                </button>
                                                                <button
                                                                    onClick={() => setShowDeleteConfirm(null)}
                                                                    className="flex-1 px-2 py-1 text-xs border border-border-light dark:border-border-dark rounded-lg hover:bg-slate-50"
                                                                >
                                                                    Cancelar
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <button
                                                            onClick={() => setShowDeleteConfirm(i)}
                                                            className="w-full px-4 py-2.5 text-sm hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2 text-red-600 dark:text-red-400"
                                                        >
                                                            <span className="material-symbols-outlined text-base">delete</span>
                                                            Excluir Pedido
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Footer */}
            <div className="mt-8 pt-6 border-t border-border-light dark:border-border-dark flex justify-between items-center text-xs text-text-secondary-light dark:text-text-secondary-dark">
                <p>© 2026 — Neurix IA</p>
                <div className="flex gap-4">
                    <a className="hover:text-primary" href="#">Suporte</a>
                    <a className="hover:text-primary" href="#">Termos</a>
                </div>
            </div>

            {/* New Order Modal */}
            {showNewOrder && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/30 dark:bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowNewOrder(false)} />
                    <div className="relative bg-surface-light dark:bg-surface-dark rounded-2xl shadow-2xl border border-border-light dark:border-border-dark w-full max-w-lg max-h-[90vh] overflow-y-auto">
                        <div className="p-6 border-b border-border-light dark:border-border-dark flex items-center justify-between">
                            <h3 className="text-lg font-bold font-display">Novo Pedido</h3>
                            <button onClick={() => setShowNewOrder(false)} className="text-text-secondary-light hover:text-text-main-light transition-colors">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>
                        <div className="p-6 space-y-5">
                            {/* Client */}
                            <div>
                                <label className="block text-xs font-semibold text-text-secondary-light uppercase tracking-wider mb-1.5">Cliente</label>
                                <div className="relative">
                                    <input
                                        className="w-full px-4 py-2.5 bg-white dark:bg-slate-800 border border-border-light dark:border-border-dark rounded-xl text-sm focus:ring-2 focus:ring-primary focus:border-transparent pl-10"
                                        placeholder="Buscar cliente existente..."
                                        type="text"
                                    />
                                    <span className="material-symbols-outlined absolute left-3 top-2.5 text-text-secondary-light text-lg">search</span>
                                </div>
                                <button className="mt-2 text-xs text-primary hover:underline flex items-center gap-1">
                                    <span className="material-symbols-outlined text-sm">add</span>
                                    Criar novo cliente
                                </button>
                            </div>
                            {/* Products */}
                            <div>
                                <label className="block text-xs font-semibold text-text-secondary-light uppercase tracking-wider mb-1.5">Produtos</label>
                                <div className="border border-border-light dark:border-border-dark rounded-xl overflow-hidden">
                                    <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50">
                                        <span className="text-sm text-text-secondary-light">Nenhum produto adicionado</span>
                                        <button className="text-primary text-sm font-medium hover:underline flex items-center gap-1">
                                            <span className="material-symbols-outlined text-sm">add</span>
                                            Adicionar
                                        </button>
                                    </div>
                                </div>
                            </div>
                            {/* Notes */}
                            <div>
                                <label className="block text-xs font-semibold text-text-secondary-light uppercase tracking-wider mb-1.5">Observações</label>
                                <textarea
                                    className="w-full px-4 py-2.5 bg-white dark:bg-slate-800 border border-border-light dark:border-border-dark rounded-xl text-sm focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
                                    placeholder="Notas sobre o pedido..."
                                    rows={3}
                                />
                            </div>
                        </div>
                        <div className="p-6 border-t border-border-light dark:border-border-dark flex gap-3">
                            <button onClick={() => setShowNewOrder(false)} className="flex-1 px-4 py-2.5 border border-border-light dark:border-border-dark rounded-xl text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                                Cancelar
                            </button>
                            <button className="flex-1 px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary-hover shadow-lg shadow-primary/30 transition-all">
                                Criar Pedido
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
