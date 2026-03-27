"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { apiFetch, getApiUrl } from "@/lib/api";
import { TenantOrgRequired } from "@/components/TenantOrgRequired";

// #region agent log
function debugLog(hypothesisId: string, location: string, message: string, data: Record<string, unknown>) {
    fetch("http://127.0.0.1:7636/ingest/c3ef2f3c-17a1-4c42-bba6-b27c2da5e6a4", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "25dc31" },
        body: JSON.stringify({
            sessionId: "25dc31",
            runId: "initial-debug-frontend",
            hypothesisId,
            location,
            message,
            data,
            timestamp: Date.now(),
        }),
    }).catch(() => { });
}
// #endregion

interface Product {
    id: string;
    name: string;
    lot_code?: string;
    status: string;
    weight?: string;
    price: number;
    category: string | null;
    category_id?: string | null;
    description?: string;
    image_url?: string;
    is_active: boolean;
    tenant_id: string;
    stock_quantity?: number;
}

interface ProductCategory {
    id: string;
    name: string;
    slug: string;
    is_active: boolean;
}

interface Promotion {
    id: string;
    name: string;
    slug: string;
    discount_type: "percent" | "fixed";
    discount_value: number;
    priority: number;
    is_active: boolean;
    product_ids: string[];
    starts_at: string;
    ends_at?: string;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
    em_estoque: { label: "EM ESTOQUE", color: "green" },
    baixo_estoque: { label: "BAIXO ESTOQUE", color: "yellow" },
    esgotado: { label: "ESGOTADO", color: "slate" },
    rascunho: { label: "RASCUNHO", color: "slate" },
};

const CATEGORY_MAP: Record<string, string> = {
    tradicional: "Tradicional",
    diet_zero: "Diet / Zero",
    gourmet: "Gourmet",
    sazonal: "Sazonal",
};

export default function ProdutosPage() {
    const [products, setProducts] = useState<Product[]>([]);
    const [categories, setCategories] = useState<ProductCategory[]>([]);
    const [promotions, setPromotions] = useState<Promotion[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [showPanel, setShowPanel] = useState(false);
    const [editingProductId, setEditingProductId] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
    const [searchQuery, setSearchQuery] = useState("");
    const [filterCategory, setFilterCategory] = useState("");
    const [showFilter, setShowFilter] = useState(false);
    const [catalogTab, setCatalogTab] = useState<"products" | "categories" | "promotions">("products");

    const fileInputRef = useRef<HTMLInputElement>(null);
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);

    const [newProduct, setNewProduct] = useState({
        name: "", price: "", weight: "", category: "",
        description: "", lot_code: "", stock_quantity: "0", promotion_id: "",
    });
    const [newCategory, setNewCategory] = useState({ name: "", slug: "" });
    const [newPromotion, setNewPromotion] = useState({
        name: "",
        slug: "",
        discount_type: "percent",
        discount_value: "",
        priority: "0",
    });

    const normalizeBrlInput = (value: string) => {
        const digits = value.replace(/\D/g, "");
        if (!digits) return "";
        const cents = Number(digits);
        return (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const parseBrlToNumber = (value: string) => {
        if (!value) return 0;
        const normalized = value.replace(/\./g, "").replace(",", ".");
        return Number(normalized) || 0;
    };

    const toBrlInput = (value: number) => {
        if (!Number.isFinite(value)) return "";
        return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const resolveProductCategorySlug = useCallback((product: Product) => {
        const raw = (product.category || "").trim().toLowerCase();
        if (raw) return raw;
        if (product.category_id) {
            const dynamic = categories.find((category) => category.id === product.category_id);
            if (dynamic?.slug) return dynamic.slug;
        }
        return "";
    }, [categories]);

    const formatWeight = (raw?: string) => {
        const value = (raw || "").trim();
        if (!value) return "";
        return /g$/i.test(value) ? value : `${value}g`;
    };

    function resetProductForm() {
        setEditingProductId(null);
        setPreviewImage(null);
        setSelectedFile(null);
        setNewProduct({ name: "", price: "", weight: "", category: "", description: "", lot_code: "", stock_quantity: "0", promotion_id: "" });
    }

    function openCreatePanel() {
        resetProductForm();
        setShowPanel(true);
    }

    function openEditPanel(product: Product) {
        const linkedPromotion = promotions.find((p) => (p.product_ids || []).includes(product.id));
        setEditingProductId(product.id);
        setPreviewImage(product.image_url || null);
        setSelectedFile(null);
        setNewProduct({
            name: product.name || "",
            price: toBrlInput(Number(product.price || 0)),
            weight: product.weight || "",
            category: resolveProductCategorySlug(product),
            description: product.description || "",
            lot_code: product.lot_code || "",
            stock_quantity: String(product.stock_quantity ?? 0),
            promotion_id: linkedPromotion?.id || "",
        });
        setShowPanel(true);
    }

    async function syncProductPromotion(productId: string, selectedPromotionId: string) {
        const currentPromotion = promotions.find((p) => (p.product_ids || []).includes(productId));
        if (currentPromotion && currentPromotion.id !== selectedPromotionId) {
            const filtered = (currentPromotion.product_ids || []).filter((id) => id !== productId);
            await apiFetch(getApiUrl(`/api/promotions/${currentPromotion.id}/products`), {
                method: "PUT",
                headers: { ...authHeaders(), "Content-Type": "application/json" },
                body: JSON.stringify({ product_ids: filtered }),
            });
        }

        if (selectedPromotionId) {
            const target = promotions.find((p) => p.id === selectedPromotionId);
            const nextIds = Array.from(new Set([...(target?.product_ids || []), productId]));
            await apiFetch(getApiUrl(`/api/promotions/${selectedPromotionId}/products`), {
                method: "PUT",
                headers: { ...authHeaders(), "Content-Type": "application/json" },
                body: JSON.stringify({ product_ids: nextIds }),
            });
        } else if (currentPromotion) {
            const filtered = (currentPromotion.product_ids || []).filter((id) => id !== productId);
            await apiFetch(getApiUrl(`/api/promotions/${currentPromotion.id}/products`), {
                method: "PUT",
                headers: { ...authHeaders(), "Content-Type": "application/json" },
                body: JSON.stringify({ product_ids: filtered }),
            });
        }
    }

    async function readErrorMessage(res: Response, fallback: string) {
        const raw = await res.text().catch(() => "");
        if (!raw) return fallback;
        try {
            const parsed = JSON.parse(raw);
            return parsed.detail || parsed.message || fallback;
        } catch {
            return raw || fallback;
        }
    }

    // ── Helpers ──────────────────────────────────────────────────
    const getToken = () => localStorage.getItem("access_token");

    const authHeaders = () => ({
        Authorization: `Bearer ${getToken()}`,
    });

    // ── Fetch products ────────────────────────────────────────────
    const fetchProducts = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await apiFetch(getApiUrl("/api/products/"), {
                headers: authHeaders(),
            });
            if (!res.ok) {
                throw new Error(`Erro ${res.status}`);
            }
            const data = await res.json();
            setProducts(data);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Erro desconhecido");
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchCategories = useCallback(async () => {
        try {
            const res = await apiFetch(getApiUrl("/api/product-categories/"), { headers: authHeaders() });
            if (!res.ok) throw new Error(`Erro ${res.status}`);
            const data = await res.json();
            setCategories(data || []);
        } catch (e) {
            console.error("Erro ao carregar categorias", e);
        }
    }, []);

    const fetchPromotions = useCallback(async () => {
        try {
            const res = await apiFetch(getApiUrl("/api/promotions/"), { headers: authHeaders() });
            if (!res.ok) throw new Error(`Erro ${res.status}`);
            const data = await res.json();
            setPromotions(data || []);
        } catch (e) {
            console.error("Erro ao carregar promoções", e);
        }
    }, []);

    useEffect(() => {
        fetchProducts();
        fetchCategories();
        fetchPromotions();
    }, [fetchProducts, fetchCategories, fetchPromotions]);

    // ── File handling ─────────────────────────────────────────────
    function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (file) {
            setSelectedFile(file);
            const reader = new FileReader();
            reader.onload = () => setPreviewImage(reader.result as string);
            reader.readAsDataURL(file);
        }
    }

    // ── Save product ──────────────────────────────────────────────
    async function handleSave() {
        if (!newProduct.name || !newProduct.price) return;
        setSaving(true);
        setError(null);

        try {
            let image_url: string | undefined;

            // Upload image if selected
            if (selectedFile) {
                const formData = new FormData();
                formData.append("file", selectedFile);
                const upRes = await apiFetch(getApiUrl("/api/upload/product-image"), {
                    method: "POST",
                    headers: authHeaders(),
                    body: formData,
                });
                if (upRes.ok) {
                    const upData = await upRes.json();
                    image_url = upData.url;
                }
            }

            const body = {
                name: newProduct.name,
                price: parseBrlToNumber(newProduct.price),
                weight: newProduct.weight || undefined,
                stock_quantity: Number(newProduct.stock_quantity || 0),
                category: newProduct.category.trim().toLowerCase() || undefined,
                category_slug: newProduct.category.trim().toLowerCase() || undefined,
                description: newProduct.description || undefined,
                lot_code: newProduct.lot_code || undefined,
                image_url,
            };

            const isEditing = Boolean(editingProductId);
            const endpoint = isEditing ? getApiUrl(`/api/products/${editingProductId}`) : getApiUrl("/api/products/");
            const method = isEditing ? "PATCH" : "POST";

            const res = await apiFetch(endpoint, {
                method,
                headers: { ...authHeaders(), "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });

            if (!res.ok) {
                const message = await readErrorMessage(res, "Erro ao salvar produto.");
                throw new Error(message);
            }

            const saved = await res.json().catch(() => null);
            const productId = String(saved?.id || editingProductId || "");
            if (productId) {
                await syncProductPromotion(productId, newProduct.promotion_id || "");
            }

            await fetchProducts();
            await fetchPromotions();
            setShowPanel(false);
            resetProductForm();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Erro desconhecido");
        } finally {
            setSaving(false);
        }
    }

    // ── Delete product ────────────────────────────────────────────
    async function handleDelete(id: string) {
        if (!confirm("Deletar produto?")) return;
        await apiFetch(getApiUrl(`/api/products/${id}`), {
            method: "DELETE",
            headers: authHeaders(),
        });
        await fetchProducts();
    }

    async function handleCreateCategory() {
        if (!newCategory.name.trim() || !newCategory.slug.trim()) return;
        setError(null);
        try {
            // #region agent log
            debugLog("H6", "frontend-next/app/(dashboard)/produtos/page.tsx:handleCreateCategory", "Submitting category create request", {
                apiBase: getApiUrl("/api/products/"),
                slug: newCategory.slug.trim().toLowerCase(),
                hasToken: Boolean(getToken()),
            });
            // #endregion
            const res = await apiFetch(getApiUrl("/api/product-categories/"), {
                method: "POST",
                headers: { ...authHeaders(), "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: newCategory.name.trim(),
                    slug: newCategory.slug.trim().toLowerCase(),
                    is_active: true,
                }),
            });
            if (!res.ok) {
                const raw = await res.text().catch(() => "");
                // #region agent log
                debugLog("H7", "frontend-next/app/(dashboard)/produtos/page.tsx:handleCreateCategory", "Category create request failed", {
                    status: res.status,
                    statusText: res.statusText,
                    responseBody: raw.slice(0, 1000),
                });
                // #endregion
                let message = "Erro ao criar categoria.";
                if (raw) {
                    try {
                        const parsed = JSON.parse(raw);
                        message = parsed.detail || parsed.message || raw;
                    } catch {
                        message = raw;
                    }
                }
                throw new Error(message);
            }
            setNewCategory({ name: "", slug: "" });
            await fetchCategories();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Erro ao criar categoria");
        }
    }

    async function handleToggleCategory(id: string, isActive: boolean) {
        setError(null);
        const endpoint = getApiUrl(`/api/product-categories/${id}`);
        const res = await apiFetch(endpoint, {
            method: isActive ? "DELETE" : "PATCH",
            headers: { ...authHeaders(), "Content-Type": "application/json" },
            body: isActive ? undefined : JSON.stringify({ is_active: true }),
        });
        if (!res.ok) {
            const message = await readErrorMessage(res, isActive ? "Erro ao inativar categoria." : "Erro ao ativar categoria.");
            throw new Error(message);
        }
        await fetchCategories();
    }

    async function handleCreatePromotion() {
        if (!newPromotion.name.trim() || !newPromotion.slug.trim() || !newPromotion.discount_value.trim()) return;
        setError(null);
        try {
            const nowIso = new Date().toISOString();
            // #region agent log
            debugLog("H8", "frontend-next/app/(dashboard)/produtos/page.tsx:handleCreatePromotion", "Submitting promotion create request", {
                apiBase: getApiUrl("/api/products/"),
                slug: newPromotion.slug.trim().toLowerCase(),
                discountType: newPromotion.discount_type,
                discountValue: Number(newPromotion.discount_value),
                hasToken: Boolean(getToken()),
            });
            // #endregion
            const res = await apiFetch(getApiUrl("/api/promotions/"), {
                method: "POST",
                headers: { ...authHeaders(), "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: newPromotion.name.trim(),
                    slug: newPromotion.slug.trim().toLowerCase(),
                    discount_type: newPromotion.discount_type,
                    discount_value: Number(newPromotion.discount_value),
                    starts_at: nowIso,
                    priority: Number(newPromotion.priority || 0),
                    is_active: true,
                    product_ids: [],
                }),
            });
            if (!res.ok) {
                const raw = await res.text().catch(() => "");
                // #region agent log
                debugLog("H9", "frontend-next/app/(dashboard)/produtos/page.tsx:handleCreatePromotion", "Promotion create request failed", {
                    status: res.status,
                    statusText: res.statusText,
                    responseBody: raw.slice(0, 1000),
                });
                // #endregion
                let message = "Erro ao criar promoção.";
                if (raw) {
                    try {
                        const parsed = JSON.parse(raw);
                        message = parsed.detail || parsed.message || raw;
                    } catch {
                        message = raw;
                    }
                }
                throw new Error(message);
            }
            setNewPromotion({ name: "", slug: "", discount_type: "percent", discount_value: "", priority: "0" });
            await fetchPromotions();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Erro ao criar promoção");
        }
    }

    async function handleArchivePromotion(id: string) {
        await apiFetch(getApiUrl(`/api/promotions/${id}`), {
            method: "DELETE",
            headers: authHeaders(),
        });
        await fetchPromotions();
    }

    // ── Filter ────────────────────────────────────────────────────
    const filtered = products.filter((p) => {
        const categorySlug = resolveProductCategorySlug(p);
        if (filterCategory && categorySlug !== filterCategory) return false;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            return p.name.toLowerCase().includes(q)
                || (p.lot_code || "").toLowerCase().includes(q)
                || categorySlug.includes(q);
        }
        return true;
    });

    const filterCategoryOptions = Array.from(new Set([
        "",
        ...categories.filter((category) => category.is_active).map((category) => category.slug),
        ...Object.keys(CATEGORY_MAP),
    ]));

    // ── Render ────────────────────────────────────────────────────
    return (
        <TenantOrgRequired>
        <div className="flex flex-col h-full relative">
            {/* Header */}
            <header className="h-16 bg-surface-light/80 dark:bg-surface-dark/80 backdrop-blur-md border-b border-border-light dark:border-border-dark flex items-center justify-between px-8 sticky top-0 z-10">
                <div className="flex items-center gap-4">
                    <h2 className="text-xl font-bold font-display">Gestão de Produtos</h2>
                    <span className="px-2.5 py-0.5 rounded-full bg-primary-light dark:bg-primary/20 text-primary text-xs font-medium border border-primary/20">
                        {products.filter(p => p.is_active).length} Ativos
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
                    <button onClick={openCreatePanel}
                        className="bg-primary hover:bg-primary-hover text-white px-4 py-2.5 rounded-lg flex items-center gap-2 shadow-lg shadow-primary/30 transition-all active:scale-95">
                        <span className="material-symbols-outlined text-lg">add</span>
                        <span className="font-medium text-sm">Novo Produto</span>
                    </button>
                </div>
            </header>

            <div className="flex-1 overflow-auto p-8">
                {/* Error */}
                {error && (
                    <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm flex items-center gap-2">
                        <span className="material-symbols-outlined text-lg">error</span>
                        {error}
                    </div>
                )}

                {/* Filters & View toggle */}
                <div className="flex justify-between items-center mb-6 gap-4">
                    <div className="flex items-center gap-2">
                        <div className="flex items-center rounded-lg border border-border-light dark:border-border-dark overflow-hidden">
                            {[
                                { id: "products", label: "Produtos" },
                                { id: "categories", label: "Categorias" },
                                { id: "promotions", label: "Promoções" },
                            ].map((tab) => (
                                <button
                                    key={tab.id}
                                    onClick={() => setCatalogTab(tab.id as "products" | "categories" | "promotions")}
                                    className={`px-3 py-1.5 text-xs font-medium ${catalogTab === tab.id ? "bg-primary text-white" : "bg-surface-light dark:bg-surface-dark hover:bg-slate-100"}`}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                        <div className="relative">
                            <button onClick={() => setShowFilter(!showFilter)}
                                className="px-3 py-1.5 bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-lg text-sm font-medium text-text-secondary-light hover:border-primary transition-colors flex items-center gap-2 shadow-sm">
                                <span className="material-symbols-outlined text-base">filter_list</span> Filtros
                            </button>
                            {showFilter && (
                                <div className="absolute top-full left-0 mt-1 w-48 bg-surface-light dark:bg-surface-dark rounded-xl shadow-2xl border border-border-light dark:border-border-dark z-50 p-3 space-y-1">
                                    <p className="text-[10px] font-semibold text-text-secondary-light uppercase tracking-wider mb-2">Categoria</p>
                                    {filterCategoryOptions.map((c) => (
                                        <button key={c || "all"} onClick={() => { setFilterCategory(c); setShowFilter(false); }}
                                            className={`block w-full text-left px-2 py-1.5 text-sm rounded-lg ${filterCategory === c ? "bg-primary/10 text-primary font-medium" : "hover:bg-slate-50 dark:hover:bg-slate-800"}`}>
                                            {c ? (categories.find((cat) => cat.slug === c)?.name || CATEGORY_MAP[c] || c) : "Todas"}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={() => setViewMode("grid")} className={`p-1.5 rounded-md transition-colors ${viewMode === "grid" ? "bg-primary-light dark:bg-primary/20 text-primary" : "text-text-secondary-light hover:bg-slate-100"}`}>
                            <span className="material-symbols-outlined text-xl">grid_view</span>
                        </button>
                        <button onClick={() => setViewMode("list")} className={`p-1.5 rounded-md transition-colors ${viewMode === "list" ? "bg-primary-light dark:bg-primary/20 text-primary" : "text-text-secondary-light hover:bg-slate-100"}`}>
                            <span className="material-symbols-outlined text-xl">view_list</span>
                        </button>
                    </div>
                </div>

                {/* Loading */}
                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <span className="material-symbols-outlined text-primary text-4xl animate-spin">progress_activity</span>
                    </div>
                ) : catalogTab === "categories" ? (
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                            <input value={newCategory.name} onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })} className="px-3 py-2 border border-border-light dark:border-border-dark rounded-lg text-sm" placeholder="Nome da categoria" />
                            <input value={newCategory.slug} onChange={(e) => setNewCategory({ ...newCategory, slug: e.target.value })} className="px-3 py-2 border border-border-light dark:border-border-dark rounded-lg text-sm" placeholder="slug-exemplo" />
                            <button onClick={handleCreateCategory} className="px-3 py-2 rounded-lg bg-primary text-white text-sm">Criar categoria</button>
                        </div>
                        <div className="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl overflow-hidden">
                            {categories.map((category) => (
                                <div key={category.id} className="flex items-center justify-between px-4 py-3 border-b border-border-light dark:border-border-dark last:border-0">
                                    <div>
                                        <p className="font-medium text-sm">{category.name}</p>
                                        <p className="text-xs text-text-secondary-light">{category.slug}</p>
                                    </div>
                                    <button
                                        onClick={() => handleToggleCategory(category.id, category.is_active).catch((e) => setError(e instanceof Error ? e.message : "Erro ao atualizar categoria"))}
                                        className={`text-xs hover:underline ${category.is_active ? "text-red-600" : "text-emerald-600"}`}
                                    >
                                        {category.is_active ? "Inativar" : "Ativar"}
                                    </button>
                                </div>
                            ))}
                            {categories.length === 0 && <p className="px-4 py-6 text-sm text-text-secondary-light">Sem categorias.</p>}
                        </div>
                    </div>
                ) : catalogTab === "promotions" ? (
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
                            <input value={newPromotion.name} onChange={(e) => setNewPromotion({ ...newPromotion, name: e.target.value })} className="px-3 py-2 border border-border-light dark:border-border-dark rounded-lg text-sm" placeholder="Nome promoção" />
                            <input value={newPromotion.slug} onChange={(e) => setNewPromotion({ ...newPromotion, slug: e.target.value })} className="px-3 py-2 border border-border-light dark:border-border-dark rounded-lg text-sm" placeholder="slug-promocao" />
                            <select value={newPromotion.discount_type} onChange={(e) => setNewPromotion({ ...newPromotion, discount_type: e.target.value as "percent" | "fixed" })} className="px-3 py-2 border border-border-light dark:border-border-dark rounded-lg text-sm">
                                <option value="percent">%</option>
                                <option value="fixed">Valor</option>
                            </select>
                            <input value={newPromotion.discount_value} onChange={(e) => setNewPromotion({ ...newPromotion, discount_value: e.target.value })} className="px-3 py-2 border border-border-light dark:border-border-dark rounded-lg text-sm" placeholder="Desconto" />
                            <button onClick={handleCreatePromotion} className="px-3 py-2 rounded-lg bg-primary text-white text-sm">Criar promoção</button>
                        </div>
                        <div className="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl overflow-hidden">
                            {promotions.map((promotion) => (
                                <div key={promotion.id} className="flex items-center justify-between px-4 py-3 border-b border-border-light dark:border-border-dark last:border-0">
                                    <div>
                                        <p className="font-medium text-sm">{promotion.name}</p>
                                        <p className="text-xs text-text-secondary-light">
                                            {promotion.discount_type === "percent" ? `${promotion.discount_value}%` : `R$ ${promotion.discount_value}`} • prioridade {promotion.priority}
                                        </p>
                                    </div>
                                    <button onClick={() => handleArchivePromotion(promotion.id)} className="text-xs text-red-600 hover:underline">
                                        {promotion.is_active ? "Inativar" : "Inativa"}
                                    </button>
                                </div>
                            ))}
                            {promotions.length === 0 && <p className="px-4 py-6 text-sm text-text-secondary-light">Sem promoções.</p>}
                        </div>
                    </div>
                ) : viewMode === "grid" ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {filtered.map((product) => {
                            const st = STATUS_LABELS[product.status] || { label: product.status, color: "slate" };
                            return (
                                <div key={product.id} className={`bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark shadow-sm hover:shadow-md transition-all group overflow-hidden ${!product.is_active ? "opacity-60 hover:opacity-100" : ""}`}>
                                    <div className="h-32 bg-gradient-to-br from-primary/5 to-primary/10 flex items-center justify-center p-4 relative overflow-hidden">
                                        <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => openEditPanel(product)} className="p-1.5 mr-1 bg-white/90 dark:bg-slate-800/90 text-slate-500 hover:text-primary rounded-full shadow-sm backdrop-blur-sm">
                                                <span className="material-symbols-outlined text-sm">edit</span>
                                            </button>
                                            <button onClick={() => handleDelete(product.id)} className="p-1.5 bg-white/90 dark:bg-slate-800/90 text-red-400 hover:text-red-600 rounded-full shadow-sm backdrop-blur-sm">
                                                <span className="material-symbols-outlined text-sm">delete</span>
                                            </button>
                                        </div>
                                        {product.image_url ? (
                                            <img src={product.image_url} alt={product.name} className="w-full h-full object-cover absolute inset-0" />
                                        ) : (
                                            <div className="w-16 h-20 bg-primary/10 backdrop-blur-sm rounded-lg border border-primary/20 flex items-center justify-center">
                                                <span className="material-symbols-outlined text-primary text-3xl">local_offer</span>
                                            </div>
                                        )}
                                    </div>
                                    <div className="p-4">
                                        <h3 className="font-bold truncate">{product.name}</h3>
                                        {product.lot_code && <p className="text-xs text-text-secondary-light mt-0.5">Lote: {product.lot_code}</p>}
                                        <p className="text-xs text-text-secondary-light mt-0.5">
                                            {(() => {
                                                const slug = resolveProductCategorySlug(product);
                                                return categories.find((cat) => cat.slug === slug)?.name || CATEGORY_MAP[slug] || slug || "Sem categoria";
                                            })()}
                                        </p>
                                        <div className="flex items-center gap-1.5 mb-3 mt-2">
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${st.color === "green" ? "bg-green-100 dark:bg-green-900/30 text-green-700" : st.color === "yellow" ? "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700" : "bg-slate-100 dark:bg-slate-800 text-slate-500"}`}>
                                                {st.label}
                                            </span>
                                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 dark:bg-blue-900/30 text-blue-700">
                                                {product.stock_quantity ?? 0} unidades
                                            </span>
                                        </div>
                                        <span className="text-lg font-bold">R$ {product.price.toFixed(2).replace(".", ",")}</span>
                                        {product.weight && <span className="ml-2 text-sm font-medium text-text-secondary-light">{formatWeight(product.weight)}</span>}
                                    </div>
                                </div>
                            );
                        })}
                        <button onClick={openCreatePanel}
                            className="border-2 border-dashed border-border-light dark:border-border-dark rounded-xl p-4 flex flex-col items-center justify-center text-text-secondary-light hover:text-primary hover:border-primary hover:bg-primary/5 transition-all h-full min-h-[280px] group">
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
                                {filtered.map((p) => {
                                    const st = STATUS_LABELS[p.status] || { label: p.status, color: "slate" };
                                    return (
                                        <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                                            <td className="px-6 py-3 font-medium">{p.name}</td>
                                            <td className="px-6 py-3 text-text-secondary-light">{p.lot_code || "—"}</td>
                                            <td className="px-6 py-3">
                                                <span className="bg-primary-light dark:bg-primary/20 text-primary text-xs px-2 py-0.5 rounded-full">
                                                    {(() => {
                                                        const slug = resolveProductCategorySlug(p);
                                                        return categories.find((cat) => cat.slug === slug)?.name || CATEGORY_MAP[slug] || slug || "Sem categoria";
                                                    })()}
                                                </span>
                                            </td>
                                            <td className="px-6 py-3">
                                                <span className={`text-xs font-bold px-2 py-0.5 rounded ${st.color === "green" ? "bg-green-100 text-green-700" : st.color === "yellow" ? "bg-yellow-100 text-yellow-700" : "bg-slate-100 text-slate-500"}`}>{st.label}</span>
                                                <span className="ml-2 text-xs text-blue-700">{p.stock_quantity ?? 0} unidades</span>
                                            </td>
                                            <td className="px-6 py-3 font-bold">
                                                R$ {p.price.toFixed(2).replace(".", ",")}
                                                {p.weight && <span className="ml-2 text-xs font-medium text-text-secondary-light">{formatWeight(p.weight)}</span>}
                                            </td>
                                            <td className="px-6 py-3 text-right">
                                                <button onClick={() => openEditPanel(p)} className="text-slate-500 hover:text-primary mr-2"><span className="material-symbols-outlined">edit</span></button>
                                                <button onClick={() => handleDelete(p.id)} className="text-red-400 hover:text-red-600"><span className="material-symbols-outlined">delete</span></button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        {filtered.length === 0 && !loading && (
                            <div className="text-center py-12 text-text-secondary-light">Nenhum produto encontrado.</div>
                        )}
                    </div>
                )}

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
                            <h3 className="font-bold text-lg">{editingProductId ? "Editar Produto" : "Novo Produto"}</h3>
                            <button onClick={() => setShowPanel(false)} className="text-text-secondary-light hover:text-text-main-light"><span className="material-symbols-outlined">close</span></button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6 space-y-5">
                            {/* Photo upload */}
                            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFileChange} />
                            <button onClick={() => fileInputRef.current?.click()}
                                className="w-full h-40 border-2 border-dashed border-border-light dark:border-border-dark rounded-xl flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-800/50 cursor-pointer hover:border-primary transition-colors group overflow-hidden">
                                {previewImage ? (
                                    <img src={previewImage} alt="Preview" className="w-full h-full object-cover" />
                                ) : (
                                    <>
                                        <span className="material-symbols-outlined text-text-secondary-light group-hover:text-primary text-3xl mb-2">add_photo_alternate</span>
                                        <span className="text-sm text-text-secondary-light">Clique para adicionar foto</span>
                                        <span className="text-xs text-text-secondary-light mt-1">JPEG, PNG ou WebP • max 5MB</span>
                                    </>
                                )}
                            </button>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-semibold text-text-secondary-light uppercase tracking-wider mb-1.5">Nome do Produto *</label>
                                    <input value={newProduct.name} onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                                        className="w-full px-4 py-2.5 bg-white dark:bg-slate-800 border border-border-light dark:border-border-dark rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent shadow-sm"
                                        placeholder="Ex: Geleia de Figo" />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-text-secondary-light uppercase tracking-wider mb-1.5">Lote</label>
                                    <input value={newProduct.lot_code} onChange={(e) => setNewProduct({ ...newProduct, lot_code: e.target.value })}
                                        className="w-full px-4 py-2.5 bg-white dark:bg-slate-800 border border-border-light dark:border-border-dark rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent shadow-sm"
                                        placeholder="Ex: #FIG-2026-01" />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-text-secondary-light uppercase tracking-wider mb-1.5">Preço (R$) *</label>
                                        <input value={newProduct.price} onChange={(e) => setNewProduct({ ...newProduct, price: normalizeBrlInput(e.target.value) })}
                                            className="w-full px-4 py-2.5 bg-white dark:bg-slate-800 border border-border-light dark:border-border-dark rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent shadow-sm"
                                            placeholder="0,00" inputMode="decimal" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-text-secondary-light uppercase tracking-wider mb-1.5">Peso</label>
                                        <input value={newProduct.weight} onChange={(e) => setNewProduct({ ...newProduct, weight: e.target.value })}
                                            className="w-full px-4 py-2.5 bg-white dark:bg-slate-800 border border-border-light dark:border-border-dark rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent shadow-sm"
                                            placeholder="320g" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-text-secondary-light uppercase tracking-wider mb-1.5">Quantidade em Estoque</label>
                                        <input
                                            value={newProduct.stock_quantity}
                                            onChange={(e) => setNewProduct({ ...newProduct, stock_quantity: e.target.value.replace(/\D/g, "") })}
                                            className="w-full px-4 py-2.5 bg-white dark:bg-slate-800 border border-border-light dark:border-border-dark rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent shadow-sm"
                                            placeholder="0"
                                            inputMode="numeric"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-text-secondary-light uppercase tracking-wider mb-1.5">Descrição</label>
                                    <textarea value={newProduct.description} onChange={(e) => setNewProduct({ ...newProduct, description: e.target.value })}
                                        className="w-full px-4 py-2.5 bg-white dark:bg-slate-800 border border-border-light dark:border-border-dark rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent shadow-sm resize-none"
                                        placeholder="Ingredientes e detalhes do sabor..." rows={3} />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-text-secondary-light uppercase tracking-wider mb-1.5">Categoria</label>
                                    <select value={newProduct.category} onChange={(e) => setNewProduct({ ...newProduct, category: e.target.value })}
                                        className="w-full px-4 py-2.5 bg-white dark:bg-slate-800 border border-border-light dark:border-border-dark rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent shadow-sm">
                                        <option value="">Sem categoria</option>
                                        {categories.filter((c) => c.is_active).map((category) => (
                                            <option key={category.id} value={category.slug}>{category.name}</option>
                                        ))}
                                        {!categories.length && Object.entries(CATEGORY_MAP).map(([val, label]) => (
                                            <option key={val} value={val}>{label}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-text-secondary-light uppercase tracking-wider mb-1.5">Promoção Vigente</label>
                                    <select
                                        value={newProduct.promotion_id}
                                        onChange={(e) => setNewProduct({ ...newProduct, promotion_id: e.target.value })}
                                        className="w-full px-4 py-2.5 bg-white dark:bg-slate-800 border border-border-light dark:border-border-dark rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent shadow-sm"
                                    >
                                        <option value="">Sem promoção</option>
                                        {promotions.filter((p) => p.is_active).map((promotion) => (
                                            <option key={promotion.id} value={promotion.id}>
                                                {promotion.name} ({promotion.discount_type === "percent" ? `${promotion.discount_value}%` : `R$ ${promotion.discount_value}`})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {error && (
                                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">
                                    {error}
                                </div>
                            )}
                        </div>
                        <div className="p-6 border-t border-border-light dark:border-border-dark bg-slate-50 dark:bg-slate-900/50">
                            <div className="flex gap-3">
                                <button onClick={() => setShowPanel(false)} className="flex-1 px-4 py-2.5 border border-border-light dark:border-border-dark rounded-lg font-medium hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">Cancelar</button>
                                <button onClick={handleSave} disabled={saving || !newProduct.name || !newProduct.price}
                                    className="flex-1 px-4 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-hover shadow-lg shadow-primary/30 font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                                    {saving ? <><span className="material-symbols-outlined text-lg animate-spin">progress_activity</span> Salvando...</> : editingProductId ? "Salvar Alterações" : "Salvar Produto"}
                                </button>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
        </TenantOrgRequired>
    );
}
