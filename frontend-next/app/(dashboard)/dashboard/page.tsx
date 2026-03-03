"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";

// Types for search and detail cards
interface SearchResult {
    id: string;
    name: string;
    type: "lead" | "order" | "product";
}

interface LeadDetail {
    id: string;
    contact_name: string;
    company_name: string;
    phone: string;
    stage: string;
    priority: string;
    value: number;
    notes: string;
    delivery_address: string;
    created_at: string;
}

interface OrderDetail {
    id: string;
    client_name: string;
    client_company: string;
    product_summary: string;
    total: number;
    payment_status: string;
    stage: string;
    notes: string;
    created_at: string;
}

interface ProductDetail {
    id: string;
    name: string;
    description: string;
    price: number;
    weight_grams: number;
    category: string;
    status: string;
    is_active: boolean;
    image_url: string;
    created_at: string;
}

// Detail Card Components
function LeadCard({ lead, onClose }: { lead: LeadDetail; onClose: () => void }) {
    const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/30 dark:bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-surface-light dark:bg-surface-dark rounded-2xl shadow-2xl border border-border-light dark:border-border-dark w-full max-w-md max-h-[85vh] overflow-y-auto">
                <div className="p-6 border-b border-border-light dark:border-border-dark flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                            <span className="material-symbols-outlined text-blue-600 dark:text-blue-400">person</span>
                        </div>
                        <div>
                            <h3 className="text-lg font-bold font-display">{lead.contact_name}</h3>
                            {lead.company_name && <p className="text-xs text-text-secondary-light dark:text-text-secondary-dark">{lead.company_name}</p>}
                        </div>
                    </div>
                    <button onClick={onClose} className="text-text-secondary-light hover:text-text-main-light transition-colors">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>
                <div className="p-6 space-y-4">
                    {lead.stage && (
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-text-secondary-light uppercase">Etapa:</span>
                            <span className="bg-primary-light dark:bg-primary/20 text-primary text-xs font-medium px-2 py-0.5 rounded-full">{lead.stage}</span>
                        </div>
                    )}
                    {lead.priority && (
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-text-secondary-light uppercase">Prioridade:</span>
                            <span className="text-sm">{lead.priority}</span>
                        </div>
                    )}
                    {lead.value > 0 && (
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-text-secondary-light uppercase">Valor:</span>
                            <span className="text-sm font-bold text-green-600">{fmt(lead.value)}</span>
                        </div>
                    )}
                    {lead.phone && (
                        <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-text-secondary-light text-base">phone</span>
                            <span className="text-sm">{lead.phone}</span>
                        </div>
                    )}
                    {lead.delivery_address && (
                        <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-text-secondary-light text-base">location_on</span>
                            <span className="text-sm">{lead.delivery_address}</span>
                        </div>
                    )}
                    {lead.notes && (
                        <div>
                            <span className="text-xs font-semibold text-text-secondary-light uppercase">Notas:</span>
                            <p className="text-sm mt-1 text-text-secondary-light dark:text-text-secondary-dark">{lead.notes}</p>
                        </div>
                    )}
                    <div className="text-xs text-text-secondary-light pt-2 border-t border-border-light dark:border-border-dark">
                        Criado em: {new Date(lead.created_at).toLocaleDateString("pt-BR")}
                    </div>
                </div>
            </div>
        </div>
    );
}

function OrderCard({ order, onClose }: { order: OrderDetail; onClose: () => void }) {
    const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
    const statusColors: Record<string, string> = {
        pago: "bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400",
        pendente: "bg-yellow-100 dark:bg-yellow-500/20 text-yellow-700 dark:text-yellow-400",
        cancelado: "bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400",
    };
    const statusClass = statusColors[(order.payment_status || "").toLowerCase()] || "bg-slate-100 text-slate-600";

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/30 dark:bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-surface-light dark:bg-surface-dark rounded-2xl shadow-2xl border border-border-light dark:border-border-dark w-full max-w-md max-h-[85vh] overflow-y-auto">
                <div className="p-6 border-b border-border-light dark:border-border-dark flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                            <span className="material-symbols-outlined text-orange-600 dark:text-orange-400">receipt_long</span>
                        </div>
                        <div>
                            <h3 className="text-lg font-bold font-display">{order.client_name}</h3>
                            {order.client_company && <p className="text-xs text-text-secondary-light dark:text-text-secondary-dark">{order.client_company}</p>}
                        </div>
                    </div>
                    <button onClick={onClose} className="text-text-secondary-light hover:text-text-main-light transition-colors">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>
                <div className="p-6 space-y-4">
                    {order.product_summary && (
                        <div>
                            <span className="text-xs font-semibold text-text-secondary-light uppercase">Produtos:</span>
                            <p className="text-sm mt-1">{order.product_summary}</p>
                        </div>
                    )}
                    <div className="flex items-center justify-between">
                        <div>
                            <span className="text-xs font-semibold text-text-secondary-light uppercase">Total:</span>
                            <p className="text-xl font-bold text-green-600 mt-0.5">{fmt(order.total || 0)}</p>
                        </div>
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${statusClass}`}>
                            {order.payment_status || "—"}
                        </span>
                    </div>
                    {order.stage && (
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-text-secondary-light uppercase">Etapa:</span>
                            <span className="bg-primary-light dark:bg-primary/20 text-primary text-xs font-medium px-2 py-0.5 rounded-full">{order.stage}</span>
                        </div>
                    )}
                    {order.notes && (
                        <div>
                            <span className="text-xs font-semibold text-text-secondary-light uppercase">Notas:</span>
                            <p className="text-sm mt-1 text-text-secondary-light dark:text-text-secondary-dark">{order.notes}</p>
                        </div>
                    )}
                    <div className="text-xs text-text-secondary-light pt-2 border-t border-border-light dark:border-border-dark">
                        Criado em: {new Date(order.created_at).toLocaleDateString("pt-BR")}
                    </div>
                </div>
            </div>
        </div>
    );
}

function ProductCard({ product, onClose }: { product: ProductDetail; onClose: () => void }) {
    const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/30 dark:bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-surface-light dark:bg-surface-dark rounded-2xl shadow-2xl border border-border-light dark:border-border-dark w-full max-w-md max-h-[85vh] overflow-y-auto">
                <div className="p-6 border-b border-border-light dark:border-border-dark flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                            <span className="material-symbols-outlined text-purple-600 dark:text-purple-400">inventory_2</span>
                        </div>
                        <div>
                            <h3 className="text-lg font-bold font-display">{product.name}</h3>
                            {product.category && <p className="text-xs text-text-secondary-light dark:text-text-secondary-dark">{product.category}</p>}
                        </div>
                    </div>
                    <button onClick={onClose} className="text-text-secondary-light hover:text-text-main-light transition-colors">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>
                <div className="p-6 space-y-4">
                    {product.image_url && (
                        <div className="rounded-xl overflow-hidden border border-border-light dark:border-border-dark">
                            <img src={product.image_url} alt={product.name} className="w-full h-48 object-cover" />
                        </div>
                    )}
                    {product.description && (
                        <p className="text-sm text-text-secondary-light dark:text-text-secondary-dark">{product.description}</p>
                    )}
                    <div className="flex items-center justify-between">
                        <div>
                            <span className="text-xs font-semibold text-text-secondary-light uppercase">Preço:</span>
                            <p className="text-xl font-bold text-green-600 mt-0.5">{fmt(product.price || 0)}</p>
                        </div>
                        {product.weight_grams > 0 && (
                            <div className="text-right">
                                <span className="text-xs font-semibold text-text-secondary-light uppercase">Peso:</span>
                                <p className="text-sm font-medium mt-0.5">{product.weight_grams}g</p>
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-text-secondary-light uppercase">Status:</span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${product.is_active ? "bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400" : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400"}`}>
                            {product.is_active ? "Ativo" : "Inativo"}
                        </span>
                    </div>
                    <div className="text-xs text-text-secondary-light pt-2 border-t border-border-light dark:border-border-dark">
                        Criado em: {new Date(product.created_at).toLocaleDateString("pt-BR")}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function DashboardPage() {
    const [showNewOrder, setShowNewOrder] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [showSearch, setShowSearch] = useState(false);
    const [openMenu, setOpenMenu] = useState<number | null>(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState<number | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    // Search state
    const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Detail card state
    const [selectedLead, setSelectedLead] = useState<LeadDetail | null>(null);
    const [selectedOrder, setSelectedOrder] = useState<OrderDetail | null>(null);
    const [selectedProduct, setSelectedProduct] = useState<ProductDetail | null>(null);

    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setOpenMenu(null);
            }
        }
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, []);

    // Debounced search function
    const performSearch = useCallback(async (query: string) => {
        if (query.trim().length < 2) {
            setSearchResults([]);
            setSearchLoading(false);
            return;
        }

        setSearchLoading(true);
        try {
            const { data, error } = await supabase
                .from("global_search")
                .select("id, name, type")
                .ilike("name", `%${query.trim()}%`)
                .limit(10);

            if (error) {
                console.error("Search error:", error.message);
                setSearchResults([]);
            } else {
                setSearchResults((data as SearchResult[]) || []);
            }
        } catch (err) {
            console.error("Search error:", err);
            setSearchResults([]);
        } finally {
            setSearchLoading(false);
        }
    }, []);

    // Handle search input change with debounce
    const handleSearchChange = (value: string) => {
        setSearchQuery(value);
        setShowSearch(value.length > 0);

        if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
        searchTimerRef.current = setTimeout(() => performSearch(value), 300);
    };

    // Handle clicking a search result — fetch detail and open card
    const handleSelectResult = async (result: SearchResult) => {
        setShowSearch(false);
        setSearchQuery("");

        try {
            if (result.type === "lead") {
                const { data, error } = await supabase
                    .from("leads")
                    .select("id, contact_name, company_name, phone, stage, priority, value, notes, delivery_address, created_at")
                    .eq("id", result.id)
                    .single();
                if (!error && data) setSelectedLead(data as LeadDetail);
            } else if (result.type === "order") {
                const { data, error } = await supabase
                    .from("orders")
                    .select("id, client_name, client_company, product_summary, total, payment_status, stage, notes, created_at")
                    .eq("id", result.id)
                    .single();
                if (!error && data) setSelectedOrder(data as OrderDetail);
            } else if (result.type === "product") {
                const { data, error } = await supabase
                    .from("products")
                    .select("id, name, description, price, weight_grams, category, status, is_active, image_url, created_at")
                    .eq("id", result.id)
                    .single();
                if (!error && data) setSelectedProduct(data as ProductDetail);
            }
        } catch (err) {
            console.error("Error fetching detail:", err);
        }
    };

    // Group search results by type
    const leadResults = searchResults.filter(r => r.type === "lead");
    const orderResults = searchResults.filter(r => r.type === "order");
    const productResults = searchResults.filter(r => r.type === "product");

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
            {/* Detail Card Modals */}
            {selectedLead && <LeadCard lead={selectedLead} onClose={() => setSelectedLead(null)} />}
            {selectedOrder && <OrderCard order={selectedOrder} onClose={() => setSelectedOrder(null)} />}
            {selectedProduct && <ProductCard product={selectedProduct} onClose={() => setSelectedProduct(null)} />}

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
                            onChange={(e) => handleSearchChange(e.target.value)}
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
                                    {searchLoading && (
                                        <p className="px-3 py-2 text-xs text-text-secondary-light text-center">Buscando...</p>
                                    )}
                                    {!searchLoading && searchResults.length === 0 && searchQuery.length >= 2 && (
                                        <p className="px-3 py-2 text-xs text-text-secondary-light text-center">Nenhum resultado encontrado</p>
                                    )}
                                    {!searchLoading && searchQuery.length < 2 && (
                                        <p className="px-3 py-2 text-xs text-text-secondary-light text-center">Digite ao menos 2 caracteres...</p>
                                    )}
                                    {leadResults.length > 0 && (
                                        <>
                                            <p className="px-3 py-1 text-[10px] font-semibold text-text-secondary-light uppercase tracking-wider">Clientes</p>
                                            {leadResults.map((r) => (
                                                <button key={r.id} onMouseDown={() => handleSelectResult(r)} className="w-full px-3 py-2 text-sm text-left hover:bg-primary/5 rounded-lg flex items-center gap-2">
                                                    <span className="material-symbols-outlined text-base text-blue-500">person</span>
                                                    {r.name}
                                                </button>
                                            ))}
                                        </>
                                    )}
                                    {orderResults.length > 0 && (
                                        <>
                                            <p className="px-3 py-1 mt-1 text-[10px] font-semibold text-text-secondary-light uppercase tracking-wider">Pedidos</p>
                                            {orderResults.map((r) => (
                                                <button key={r.id} onMouseDown={() => handleSelectResult(r)} className="w-full px-3 py-2 text-sm text-left hover:bg-primary/5 rounded-lg flex items-center gap-2">
                                                    <span className="material-symbols-outlined text-base text-orange-500">receipt_long</span>
                                                    {r.name}
                                                </button>
                                            ))}
                                        </>
                                    )}
                                    {productResults.length > 0 && (
                                        <>
                                            <p className="px-3 py-1 mt-1 text-[10px] font-semibold text-text-secondary-light uppercase tracking-wider">Produtos</p>
                                            {productResults.map((r) => (
                                                <button key={r.id} onMouseDown={() => handleSelectResult(r)} className="w-full px-3 py-2 text-sm text-left hover:bg-primary/5 rounded-lg flex items-center gap-2">
                                                    <span className="material-symbols-outlined text-base text-purple-500">inventory_2</span>
                                                    {r.name}
                                                </button>
                                            ))}
                                        </>
                                    )}
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
