"use client";

import { useState, useRef } from "react";

interface Product {
    id: string;
    name: string;
    lot: string;
    status: string;
    statusColor: string;
    weight: string;
    price: string;
    category: string;
    description: string;
    icon: string;
    dimmed?: boolean;
}

export default function ProdutosPage() {
    const [showPanel, setShowPanel] = useState(false);
    const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
    const [showFilter, setShowFilter] = useState(false);
    const [showSort, setShowSort] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [filterCategory, setFilterCategory] = useState("");
    const [sortBy, setSortBy] = useState("");
    const [showCategoryEditor, setShowCategoryEditor] = useState(false);
    const [categories, setCategories] = useState(["Tradicional", "Diet / Zero", "Gourmet", "Sazonal"]);
    const [newCatName, setNewCatName] = useState("");
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [previewImage, setPreviewImage] = useState<string | null>(null);

    const [newProduct, setNewProduct] = useState({ name: "", price: "", weight: "", category: "Tradicional", description: "", lot: "" });

    const products: Product[] = [
        { id: "p1", name: "Geleia de Morango", lot: "#MRG-2023-01", status: "EM ESTOQUE", statusColor: "green", weight: "320g", price: "R$ 24,90", category: "Tradicional", description: "Geleia artesanal de morango orgânico", icon: "local_offer" },
        { id: "p2", name: "Geleia de Damasco", lot: "#DMC-2023-05", status: "BAIXO ESTOQUE", statusColor: "yellow", weight: "320g", price: "R$ 28,90", category: "Gourmet", description: "Damasco importado premium", icon: "emoji_nature" },
        { id: "p3", name: "Geleia de Amora", lot: "#AMR-2023-11", status: "EM ESTOQUE", statusColor: "green", weight: "200g", price: "R$ 19,90", category: "Tradicional", description: "Amora silvestre selecionada", icon: "spa" },
        { id: "p4", name: "Geleia de Pimenta", lot: "#PIM-2023-02", status: "ESGOTADO", statusColor: "slate", weight: "180g", price: "R$ 22,90", category: "Gourmet", description: "Pimenta dedo-de-moça com toque agridoce", icon: "block", dimmed: true },
    ];

    const history = [
        { name: "Geleia de Morango Orgânica", status: "Ativo", statusColor: "green", price: "R$ 24,90" },
        { name: "Geleia de Laranja com Gengibre", status: "Ativo", statusColor: "green", price: "R$ 26,50" },
        { name: "Geleia de Frutas Vermelhas", status: "Rascunho", statusColor: "slate", price: "R$ 32,00" },
    ];

    // Filter and sort
    const filtered = products.filter((p) => {
        if (filterCategory && p.category !== filterCategory) return false;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            return p.name.toLowerCase().includes(q) || p.lot.toLowerCase().includes(q) || p.category.toLowerCase().includes(q) || p.description.toLowerCase().includes(q);
        }
        return true;
    }).sort((a, b) => {
        if (sortBy === "name") return a.name.localeCompare(b.name);
        if (sortBy === "price") return parseFloat(a.price.replace(/[^\d,]/g, "").replace(",", ".")) - parseFloat(b.price.replace(/[^\d,]/g, "").replace(",", "."));
        if (sortBy === "category") return a.category.localeCompare(b.category);
        if (sortBy === "lot") return a.lot.localeCompare(b.lot);
        return 0;
    });

    function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = () => setPreviewImage(reader.result as string);
            reader.readAsDataURL(file);
        }
    }

    function openNewProduct() {
        setShowPanel(true);
        setPreviewImage(null);
        setNewProduct({ name: "", price: "", weight: "", category: "Tradicional", description: "", lot: "" });
    }

    function addCategory() {
        if (newCatName.trim() && !categories.includes(newCatName.trim())) {
            setCategories([...categories, newCatName.trim()]);
            setNewCatName("");
        }
    }

    return (
        <div className="flex flex-col h-full relative">
            {/* Header */}
            <header className="h-16 bg-surface-light/80 dark:bg-surface-dark/80 backdrop-blur-md border-b border-border-light dark:border-border-dark flex items-center justify-between px-8 sticky top-0 z-10">
                <div className="flex items-center gap-4">
                    <h2 className="text-xl font-bold font-display">Gestão de Produtos</h2>
                    <span className="px-2.5 py-0.5 rounded-full bg-primary-light dark:bg-primary/20 text-primary text-xs font-medium border border-primary/20">
                        {products.length} Ativos
                    </span>
                </div>
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary-light text-xl">search</span>
                        <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10 pr-4 py-2 bg-slate-100 dark:bg-slate-800 border-none rounded-lg text-sm placeholder-text-secondary-light focus:ring-2 focus:ring-primary w-64 transition-all"
                            placeholder="Buscar por nome, lote, categoria..."
                            type="text" />
                    </div>
                    <button onClick={openNewProduct} className="bg-primary hover:bg-primary-hover text-white px-4 py-2.5 rounded-lg flex items-center gap-2 shadow-lg shadow-primary/30 transition-all active:scale-95">
                        <span className="material-symbols-outlined text-lg">add</span>
                        <span className="font-medium text-sm">Novo Produto</span>
                    </button>
                </div>
            </header>

            <div className="flex-1 overflow-auto p-8">
                {/* Filters & View toggle */}
                <div className="flex justify-between items-center mb-6 gap-4">
                    <div className="flex items-center gap-2">
                        {/* Filter */}
                        <div className="relative">
                            <button onClick={() => { setShowFilter(!showFilter); setShowSort(false); }}
                                className="px-3 py-1.5 bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-lg text-sm font-medium text-text-secondary-light hover:border-primary transition-colors flex items-center gap-2 shadow-sm">
                                <span className="material-symbols-outlined text-base">filter_list</span> Filtros
                            </button>
                            {showFilter && (
                                <div className="absolute top-full left-0 mt-1 w-56 bg-surface-light dark:bg-surface-dark rounded-xl shadow-2xl border border-border-light dark:border-border-dark z-50 p-3 space-y-2">
                                    <p className="text-[10px] font-semibold text-text-secondary-light uppercase tracking-wider">Categoria</p>
                                    {["", ...categories].map((c) => (
                                        <button key={c || "all"} onClick={() => { setFilterCategory(c); setShowFilter(false); }}
                                            className={`block w-full text-left px-2 py-1.5 text-sm rounded-lg ${filterCategory === c ? "bg-primary/10 text-primary font-medium" : "hover:bg-slate-50 dark:hover:bg-slate-800"}`}>
                                            {c || "Todas"}
                                        </button>
                                    ))}
                                    <div className="border-t border-border-light dark:border-border-dark pt-2">
                                        <p className="text-[10px] font-semibold text-text-secondary-light uppercase tracking-wider mb-1">Por Lote</p>
                                        <button className="block w-full text-left px-2 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg">Filtrar por lote...</button>
                                    </div>
                                    <button onClick={() => { setFilterCategory(""); setShowFilter(false); }} className="text-xs text-primary hover:underline w-full text-center pt-1">Limpar</button>
                                </div>
                            )}
                        </div>
                        {/* Sort */}
                        <div className="relative">
                            <button onClick={() => { setShowSort(!showSort); setShowFilter(false); }}
                                className="px-3 py-1.5 bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-lg text-sm font-medium text-text-secondary-light hover:border-primary transition-colors flex items-center gap-2 shadow-sm">
                                <span className="material-symbols-outlined text-base">sort</span> Ordenar
                            </button>
                            {showSort && (
                                <div className="absolute top-full left-0 mt-1 w-48 bg-surface-light dark:bg-surface-dark rounded-xl shadow-2xl border border-border-light dark:border-border-dark z-50 p-2">
                                    {[{ v: "", l: "Padrão" }, { v: "name", l: "Nome" }, { v: "price", l: "Preço" }, { v: "category", l: "Categoria" }, { v: "lot", l: "Lote" }].map(({ v, l }) => (
                                        <button key={v} onClick={() => { setSortBy(v); setShowSort(false); }}
                                            className={`block w-full text-left px-2 py-1.5 text-sm rounded-lg ${sortBy === v ? "bg-primary/10 text-primary font-medium" : "hover:bg-slate-50 dark:hover:bg-slate-800"}`}>
                                            {l}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                    {/* View toggle */}
                    <div className="flex items-center gap-2">
                        <button onClick={() => setViewMode("grid")} className={`p-1.5 rounded-md transition-colors ${viewMode === "grid" ? "bg-primary-light dark:bg-primary/20 text-primary" : "text-text-secondary-light hover:bg-slate-100"}`}>
                            <span className="material-symbols-outlined text-xl">grid_view</span>
                        </button>
                        <button onClick={() => setViewMode("list")} className={`p-1.5 rounded-md transition-colors ${viewMode === "list" ? "bg-primary-light dark:bg-primary/20 text-primary" : "text-text-secondary-light hover:bg-slate-100"}`}>
                            <span className="material-symbols-outlined text-xl">view_list</span>
                        </button>
                    </div>
                </div>

                {/* Products — Grid or List */}
                {viewMode === "grid" ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {filtered.map((product) => (
                            <div key={product.id} className={`bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark shadow-sm hover:shadow-md transition-all group overflow-hidden ${product.dimmed ? "opacity-60 hover:opacity-100" : ""}`}>
                                <div className="h-32 bg-gradient-to-br from-primary/5 to-primary/10 flex items-center justify-center p-4 relative">
                                    <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button className="p-1.5 bg-white/90 dark:bg-slate-800/90 text-text-secondary-light hover:text-primary rounded-full shadow-sm backdrop-blur-sm">
                                            <span className="material-symbols-outlined text-sm">more_horiz</span>
                                        </button>
                                    </div>
                                    <div className="w-16 h-20 bg-primary/10 backdrop-blur-sm rounded-lg border border-primary/20 flex items-center justify-center">
                                        <span className="material-symbols-outlined text-primary text-3xl">{product.icon}</span>
                                    </div>
                                </div>
                                <div className="p-4">
                                    <h3 className="font-bold truncate">{product.name}</h3>
                                    <p className="text-xs text-text-secondary-light mt-0.5">Lote: {product.lot}</p>
                                    <p className="text-xs text-text-secondary-light mt-0.5">{product.category}</p>
                                    <div className="flex items-center gap-1.5 mb-3 mt-2">
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${product.statusColor === "green" ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400" : product.statusColor === "yellow" ? "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400" : "bg-slate-100 dark:bg-slate-800 text-slate-500"}`}>
                                            {product.status}
                                        </span>
                                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-text-secondary-light">{product.weight}</span>
                                    </div>
                                    <span className={`text-lg font-bold ${product.dimmed ? "text-text-secondary-light line-through" : ""}`}>{product.price}</span>
                                </div>
                            </div>
                        ))}
                        {/* Add btn */}
                        <button onClick={openNewProduct} className="border-2 border-dashed border-border-light dark:border-border-dark rounded-xl p-4 flex flex-col items-center justify-center text-text-secondary-light hover:text-primary hover:border-primary hover:bg-primary/5 transition-all h-full min-h-[280px] group">
                            <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 group-hover:bg-primary-light flex items-center justify-center mb-3 transition-colors">
                                <span className="material-symbols-outlined text-2xl group-hover:text-primary transition-colors">add</span>
                            </div>
                            <span className="font-medium text-sm">Adicionar Novo Sabor</span>
                        </button>
                    </div>
                ) : (
                    <div className="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl overflow-hidden shadow-sm">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 dark:bg-slate-800/50 text-xs uppercase font-semibold text-text-secondary-light">
                                <tr>
                                    <th className="px-6 py-3">Produto</th>
                                    <th className="px-6 py-3">Lote</th>
                                    <th className="px-6 py-3">Categoria</th>
                                    <th className="px-6 py-3">Status</th>
                                    <th className="px-6 py-3">Preço</th>
                                    <th className="px-6 py-3 text-right">Ação</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border-light dark:divide-border-dark">
                                {filtered.map((p) => (
                                    <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                                        <td className="px-6 py-3 font-medium">{p.name}</td>
                                        <td className="px-6 py-3 text-text-secondary-light">{p.lot}</td>
                                        <td className="px-6 py-3"><span className="bg-primary-light dark:bg-primary/20 text-primary text-xs px-2 py-0.5 rounded-full">{p.category}</span></td>
                                        <td className="px-6 py-3">
                                            <span className={`text-xs font-bold px-2 py-0.5 rounded ${p.statusColor === "green" ? "bg-green-100 text-green-700" : p.statusColor === "yellow" ? "bg-yellow-100 text-yellow-700" : "bg-slate-100 text-slate-500"}`}>{p.status}</span>
                                        </td>
                                        <td className="px-6 py-3 font-bold">{p.price}</td>
                                        <td className="px-6 py-3 text-right">
                                            <button className="text-text-secondary-light hover:text-primary"><span className="material-symbols-outlined">edit</span></button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Movements Table */}
                <div className="mt-10">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-bold font-display">Últimas Movimentações</h3>
                        <a className="text-sm text-primary hover:underline" href="#">Ver todos</a>
                    </div>
                    <div className="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl overflow-hidden shadow-sm">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 dark:bg-slate-800/50 text-xs uppercase font-semibold text-text-secondary-light">
                                <tr><th className="px-6 py-4">Produto</th><th className="px-6 py-4">Status</th><th className="px-6 py-4">Preço Unit.</th><th className="px-6 py-4 text-right">Ação</th></tr>
                            </thead>
                            <tbody className="divide-y divide-border-light dark:divide-border-dark">
                                {history.map((item, i) => (
                                    <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                                        <td className="px-6 py-4 font-medium">{item.name}</td>
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${item.statusColor === "green" ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                                                <span className={`w-1.5 h-1.5 rounded-full ${item.statusColor === "green" ? "bg-green-500" : "bg-slate-400"}`} /> {item.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">{item.price}</td>
                                        <td className="px-6 py-4 text-right"><button className="text-text-secondary-light hover:text-primary"><span className="material-symbols-outlined">edit</span></button></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="mt-8 pt-6 border-t border-border-light dark:border-border-dark text-xs text-text-secondary-light text-center">
                    <p>© 2026 — Neurix IA</p>
                </div>
            </div>

            {/* Side Panel: New Product */}
            {showPanel && (
                <>
                    <div className="fixed inset-0 bg-slate-900/20 dark:bg-slate-900/50 z-40 backdrop-blur-[1px]" onClick={() => setShowPanel(false)} />
                    <div className="absolute inset-y-0 right-0 w-[420px] bg-surface-light dark:bg-surface-dark shadow-2xl border-l border-border-light dark:border-border-dark flex flex-col z-50">
                        <div className="h-16 flex items-center justify-between px-6 border-b border-border-light dark:border-border-dark bg-slate-50/50 dark:bg-slate-900/50">
                            <h3 className="font-bold text-lg">Novo Produto</h3>
                            <button onClick={() => setShowPanel(false)} className="text-text-secondary-light hover:text-text-main-light"><span className="material-symbols-outlined">close</span></button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6 space-y-5">
                            {/* Photo upload — functional */}
                            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                            <button onClick={() => fileInputRef.current?.click()}
                                className="w-full h-40 border-2 border-dashed border-border-light dark:border-border-dark rounded-xl flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-800/50 cursor-pointer hover:border-primary transition-colors group overflow-hidden">
                                {previewImage ? (
                                    <img src={previewImage} alt="Preview" className="w-full h-full object-cover" />
                                ) : (
                                    <>
                                        <span className="material-symbols-outlined text-text-secondary-light group-hover:text-primary text-3xl mb-2">add_photo_alternate</span>
                                        <span className="text-sm text-text-secondary-light">Clique para adicionar foto</span>
                                    </>
                                )}
                            </button>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-semibold text-text-secondary-light uppercase tracking-wider mb-1.5">Nome do Produto</label>
                                    <input value={newProduct.name} onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                                        className="w-full px-4 py-2.5 bg-white dark:bg-slate-800 border border-border-light dark:border-border-dark rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent shadow-sm"
                                        placeholder="Ex: Geleia de Figo" />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-text-secondary-light uppercase tracking-wider mb-1.5">Lote</label>
                                    <input value={newProduct.lot} onChange={(e) => setNewProduct({ ...newProduct, lot: e.target.value })}
                                        className="w-full px-4 py-2.5 bg-white dark:bg-slate-800 border border-border-light dark:border-border-dark rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent shadow-sm"
                                        placeholder="Ex: #FIG-2026-01" />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-text-secondary-light uppercase tracking-wider mb-1.5">Preço (R$)</label>
                                        <input value={newProduct.price} onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })}
                                            className="w-full px-4 py-2.5 bg-white dark:bg-slate-800 border border-border-light dark:border-border-dark rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent shadow-sm"
                                            placeholder="0,00" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-text-secondary-light uppercase tracking-wider mb-1.5">Peso (g)</label>
                                        <input value={newProduct.weight} onChange={(e) => setNewProduct({ ...newProduct, weight: e.target.value })}
                                            className="w-full px-4 py-2.5 bg-white dark:bg-slate-800 border border-border-light dark:border-border-dark rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent shadow-sm"
                                            placeholder="0g" />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-text-secondary-light uppercase tracking-wider mb-1.5">Descrição</label>
                                    <textarea value={newProduct.description} onChange={(e) => setNewProduct({ ...newProduct, description: e.target.value })}
                                        className="w-full px-4 py-2.5 bg-white dark:bg-slate-800 border border-border-light dark:border-border-dark rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent shadow-sm resize-none"
                                        placeholder="Ingredientes e detalhes do sabor..." rows={3} />
                                </div>
                                {/* Category with editor */}
                                <div>
                                    <div className="flex items-center justify-between mb-1.5">
                                        <label className="text-xs font-semibold text-text-secondary-light uppercase tracking-wider">Categoria</label>
                                        <button onClick={() => setShowCategoryEditor(!showCategoryEditor)} className="text-xs text-primary hover:underline flex items-center gap-0.5">
                                            <span className="material-symbols-outlined text-sm">edit</span> Editar categorias
                                        </button>
                                    </div>
                                    <select value={newProduct.category} onChange={(e) => setNewProduct({ ...newProduct, category: e.target.value })}
                                        className="w-full px-4 py-2.5 bg-white dark:bg-slate-800 border border-border-light dark:border-border-dark rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent shadow-sm">
                                        {categories.map((c) => <option key={c}>{c}</option>)}
                                    </select>
                                    {showCategoryEditor && (
                                        <div className="mt-2 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-border-light dark:border-border-dark space-y-2">
                                            {categories.map((c, i) => (
                                                <div key={c} className="flex items-center justify-between text-sm">
                                                    <span>{c}</span>
                                                    <button onClick={() => setCategories(categories.filter((_, j) => j !== i))}
                                                        className="text-red-500 hover:text-red-700 text-xs"><span className="material-symbols-outlined text-base">close</span></button>
                                                </div>
                                            ))}
                                            <div className="flex gap-2 pt-1">
                                                <input value={newCatName} onChange={(e) => setNewCatName(e.target.value)} placeholder="Nova categoria"
                                                    className="flex-1 px-2 py-1 text-sm border border-border-light dark:border-border-dark rounded-lg bg-white dark:bg-slate-800" />
                                                <button onClick={addCategory} className="px-3 py-1 bg-primary text-white text-xs rounded-lg hover:bg-primary-hover">Criar</button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="p-6 border-t border-border-light dark:border-border-dark bg-slate-50 dark:bg-slate-900/50">
                            <div className="flex gap-3">
                                <button onClick={() => setShowPanel(false)} className="flex-1 px-4 py-2.5 border border-border-light dark:border-border-dark rounded-lg font-medium hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">Cancelar</button>
                                <button className="flex-1 px-4 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-hover shadow-lg shadow-primary/30 font-medium transition-all">Salvar Produto</button>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
