"use client";

import { useState } from "react";

export default function ProdutosPage() {
    const [showPanel, setShowPanel] = useState(false);

    const products = [
        { name: "Geleia de Morango", lot: "#MRG-2023-01", status: "EM ESTOQUE", statusColor: "green", weight: "320g", price: "R$ 24,90", color: "red", icon: "local_offer" },
        { name: "Geleia de Damasco", lot: "#DMC-2023-05", status: "BAIXO ESTOQUE", statusColor: "yellow", weight: "320g", price: "R$ 28,90", color: "yellow", icon: "emoji_nature" },
        { name: "Geleia de Amora", lot: "#AMR-2023-11", status: "EM ESTOQUE", statusColor: "green", weight: "200g", price: "R$ 19,90", color: "purple", icon: "spa" },
        { name: "Geleia de Pimenta", lot: "#PIM-2023-02", status: "ESGOTADO", statusColor: "slate", weight: "180g", price: "R$ 22,90", color: "slate", icon: "block", dimmed: true },
    ];

    const history = [
        { name: "Geleia de Morango Orgânica", status: "Ativo", statusColor: "green", price: "R$ 24,90" },
        { name: "Geleia de Laranja com Gengibre", status: "Ativo", statusColor: "green", price: "R$ 26,50" },
        { name: "Geleia de Frutas Vermelhas", status: "Rascunho", statusColor: "slate", price: "R$ 32,00" },
    ];

    return (
        <div className="flex flex-col h-full relative">
            {/* Header */}
            <header className="h-20 bg-surface-light/80 dark:bg-surface-dark/80 backdrop-blur-md border-b border-border-light dark:border-border-dark flex items-center justify-between px-8 sticky top-0 z-10">
                <div className="flex items-center gap-4">
                    <h2 className="text-xl font-bold font-display">Gestão de Produtos</h2>
                    <span className="px-2.5 py-0.5 rounded-full bg-primary-light dark:bg-primary/20 text-primary text-xs font-medium border border-primary/20">
                        {products.length} Ativos
                    </span>
                </div>
                <div className="flex items-center gap-4">
                    <div className="relative">
                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary-light text-xl">
                            search
                        </span>
                        <input
                            className="pl-10 pr-4 py-2 bg-slate-100 dark:bg-slate-800 border-none rounded-lg text-sm placeholder-text-secondary-light focus:ring-2 focus:ring-primary w-64 transition-all"
                            placeholder="Buscar produto..."
                            type="text"
                        />
                    </div>
                    <button
                        onClick={() => setShowPanel(true)}
                        className="bg-primary hover:bg-primary-hover text-white px-4 py-2.5 rounded-lg flex items-center gap-2 shadow-lg shadow-primary/30 transition-all active:scale-95"
                    >
                        <span className="material-symbols-outlined text-lg">add</span>
                        <span className="font-medium text-sm">Novo Produto</span>
                    </button>
                </div>
            </header>

            <div className="flex-1 overflow-auto p-8">
                {/* Filters */}
                <div className="flex justify-between items-center mb-6 gap-4">
                    <div className="flex items-center gap-2">
                        <button className="px-3 py-1.5 bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-lg text-sm font-medium text-text-secondary-light hover:border-primary transition-colors flex items-center gap-2 shadow-sm">
                            <span className="material-symbols-outlined text-base">filter_list</span>
                            Filtros
                        </button>
                        <button className="px-3 py-1.5 bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-lg text-sm font-medium text-text-secondary-light hover:border-primary transition-colors flex items-center gap-2 shadow-sm">
                            <span className="material-symbols-outlined text-base">sort</span>
                            Ordenar
                        </button>
                    </div>
                    <div className="flex items-center gap-2">
                        <button className="p-1.5 bg-primary-light dark:bg-primary/20 text-primary rounded-md">
                            <span className="material-symbols-outlined text-xl">grid_view</span>
                        </button>
                        <button className="p-1.5 text-text-secondary-light hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md">
                            <span className="material-symbols-outlined text-xl">view_list</span>
                        </button>
                    </div>
                </div>

                {/* Product Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {products.map((product) => (
                        <div
                            key={product.lot}
                            className={`bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark shadow-sm hover:shadow-md transition-all group overflow-hidden relative ${product.dimmed ? "opacity-60 hover:opacity-100" : ""
                                }`}
                        >
                            <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button className="p-1.5 bg-white/90 dark:bg-slate-800/90 text-text-secondary-light hover:text-primary rounded-full shadow-sm backdrop-blur-sm">
                                    <span className="material-symbols-outlined text-sm">more_horiz</span>
                                </button>
                            </div>
                            <div className={`h-32 bg-gradient-to-br from-${product.color}-50 to-${product.color}-50/50 dark:from-${product.color}-900/10 dark:to-${product.color}-900/5 flex items-center justify-center p-4`}>
                                <div className={`w-16 h-20 bg-${product.color}-400/20 backdrop-blur-sm rounded-lg border border-${product.color}-300/30 flex items-center justify-center`}>
                                    <span className={`material-symbols-outlined text-${product.color}-400 text-3xl`}>
                                        {product.icon}
                                    </span>
                                </div>
                            </div>
                            <div className="p-4">
                                <h3 className="font-bold truncate">{product.name}</h3>
                                <p className="text-xs text-text-secondary-light mt-0.5">Lote: {product.lot}</p>
                                <div className="flex items-center gap-1.5 mb-4 mt-2">
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold bg-${product.statusColor}-100 dark:bg-${product.statusColor}-900/30 text-${product.statusColor}-700 dark:text-${product.statusColor}-400`}>
                                        {product.status}
                                    </span>
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-text-secondary-light">
                                        {product.weight}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className={`text-lg font-bold ${product.dimmed ? "text-text-secondary-light line-through" : ""}`}>
                                        {product.price}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))}

                    {/* Add New */}
                    <button
                        onClick={() => setShowPanel(true)}
                        className="border-2 border-dashed border-border-light dark:border-border-dark rounded-xl p-4 flex flex-col items-center justify-center text-text-secondary-light hover:text-primary hover:border-primary hover:bg-primary/5 transition-all h-full min-h-[280px] group"
                    >
                        <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 group-hover:bg-primary-light flex items-center justify-center mb-3 transition-colors">
                            <span className="material-symbols-outlined text-2xl group-hover:text-primary transition-colors">add</span>
                        </div>
                        <span className="font-medium text-sm">Adicionar Novo Sabor</span>
                    </button>
                </div>

                {/* Movements Table */}
                <div className="mt-10">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-bold font-display">Últimas Movimentações</h3>
                        <a className="text-sm text-primary hover:underline" href="#">Ver todos</a>
                    </div>
                    <div className="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl overflow-hidden shadow-sm">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 dark:bg-slate-800/50 text-xs uppercase font-semibold text-text-secondary-light">
                                <tr>
                                    <th className="px-6 py-4">Produto</th>
                                    <th className="px-6 py-4">Status</th>
                                    <th className="px-6 py-4">Preço Unit.</th>
                                    <th className="px-6 py-4 text-right">Ação</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border-light dark:divide-border-dark">
                                {history.map((item, i) => (
                                    <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                                        <td className="px-6 py-4 font-medium">{item.name}</td>
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-${item.statusColor}-100 dark:bg-${item.statusColor}-900/30 text-${item.statusColor}-700 dark:text-${item.statusColor}-400`}>
                                                <span className={`w-1.5 h-1.5 rounded-full bg-${item.statusColor}-500`} />
                                                {item.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">{item.price}</td>
                                        <td className="px-6 py-4 text-right">
                                            <button className="text-text-secondary-light hover:text-primary transition-colors">
                                                <span className="material-symbols-outlined">edit</span>
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Side Panel: New Product */}
            {showPanel && (
                <>
                    <div
                        className="fixed inset-0 bg-slate-900/20 dark:bg-slate-900/50 z-40 backdrop-blur-[1px]"
                        onClick={() => setShowPanel(false)}
                    />
                    <div className="absolute inset-y-0 right-0 w-96 bg-surface-light dark:bg-surface-dark shadow-2xl border-l border-border-light dark:border-border-dark flex flex-col z-50">
                        <div className="h-16 flex items-center justify-between px-6 border-b border-border-light dark:border-border-dark bg-slate-50/50 dark:bg-slate-900/50">
                            <h3 className="font-bold text-lg">Novo Produto</h3>
                            <button
                                onClick={() => setShowPanel(false)}
                                className="text-text-secondary-light hover:text-text-main-light transition-colors"
                            >
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            <div className="w-full h-40 border-2 border-dashed border-border-light dark:border-border-dark rounded-xl flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-800/50 cursor-pointer hover:border-primary transition-colors group">
                                <span className="material-symbols-outlined text-text-secondary-light group-hover:text-primary text-3xl mb-2 transition-colors">
                                    add_photo_alternate
                                </span>
                                <span className="text-sm text-text-secondary-light">Arraste uma foto ou clique</span>
                            </div>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-semibold text-text-secondary-light uppercase tracking-wider mb-1.5">
                                        Nome do Produto
                                    </label>
                                    <input
                                        className="w-full px-4 py-2.5 bg-white dark:bg-slate-800 border border-border-light dark:border-border-dark rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent transition-shadow shadow-sm"
                                        placeholder="Ex: Geleia de Figo"
                                        type="text"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-text-secondary-light uppercase tracking-wider mb-1.5">
                                            Preço (R$)
                                        </label>
                                        <input
                                            className="w-full px-4 py-2.5 bg-white dark:bg-slate-800 border border-border-light dark:border-border-dark rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent transition-shadow shadow-sm"
                                            placeholder="0,00"
                                            type="text"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-text-secondary-light uppercase tracking-wider mb-1.5">
                                            Peso (g)
                                        </label>
                                        <input
                                            className="w-full px-4 py-2.5 bg-white dark:bg-slate-800 border border-border-light dark:border-border-dark rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent transition-shadow shadow-sm"
                                            placeholder="0g"
                                            type="text"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-text-secondary-light uppercase tracking-wider mb-1.5">
                                        Ingredientes / Descrição
                                    </label>
                                    <textarea
                                        className="w-full px-4 py-2.5 bg-white dark:bg-slate-800 border border-border-light dark:border-border-dark rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent transition-shadow shadow-sm resize-none"
                                        placeholder="Descreva os ingredientes e detalhes do sabor..."
                                        rows={4}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-text-secondary-light uppercase tracking-wider mb-1.5">
                                        Categoria
                                    </label>
                                    <select className="w-full px-4 py-2.5 bg-white dark:bg-slate-800 border border-border-light dark:border-border-dark rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent transition-shadow shadow-sm">
                                        <option>Tradicional</option>
                                        <option>Diet / Zero</option>
                                        <option>Gourmet</option>
                                        <option>Sazonal</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                        <div className="p-6 border-t border-border-light dark:border-border-dark bg-slate-50 dark:bg-slate-900/50">
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setShowPanel(false)}
                                    className="flex-1 px-4 py-2.5 border border-border-light dark:border-border-dark text-text-secondary-light rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 font-medium transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button className="flex-1 px-4 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-hover shadow-lg shadow-primary/30 font-medium transition-all">
                                    Salvar Produto
                                </button>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
