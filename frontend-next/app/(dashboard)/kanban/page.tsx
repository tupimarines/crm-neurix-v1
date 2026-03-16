"use client";

import { useState, useRef, useEffect, useId, useCallback } from "react";
import { createPortal } from "react-dom";
import {
    DndContext,
    closestCenter,
    pointerWithin,
    PointerSensor,
    useSensor,
    useSensors,
    DragOverlay,
    DragStartEvent,
    DragEndEvent,
    DragOverEvent,
    useDroppable,
} from "@dnd-kit/core";
import {
    SortableContext,
    useSortable,
    verticalListSortingStrategy,
    horizontalListSortingStrategy,
    arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import WhatsAppChat from "@/components/WhatsAppChat";

// Types
interface KanbanCard {
    id: string;
    name: string;
    contact: string;
    phone: string;
    value: string;
    priority: string;
    priorityColor: string;
    desc: string;
    stageId: string;
    products_json?: {
        id: string;
        name: string;
        quantity?: number;
        qty?: number;
        price: number;
        line_total?: number;
        line_discount?: number;
        applied_promotion_name?: string | null;
    }[];
}

interface KanbanStage {
    id: string;
    title: string;
    version: number;
    isConversion?: boolean;
}

// Sortable Card Component
function SortableCard({ card, onOpenChat, onOpenMenu }: { card: KanbanCard; onOpenChat: (id: string) => void; onOpenMenu: (id: string, anchor: DOMRect) => void }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id, data: { type: "card" } });
    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
    };

    return (
        <div ref={setNodeRef} style={style} {...attributes} {...listeners}
            data-kanban-card="true"
            className="bg-surface-light dark:bg-surface-dark p-4 rounded-lg shadow-sm border border-border-light dark:border-border-dark hover:shadow-md hover:border-primary/30 transition-all cursor-grab active:cursor-grabbing touch-none"
        >
            <div className="flex justify-between items-start mb-2">
                <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold truncate">{card.name}</h3>
                    {card.phone && <p className="text-xs text-text-secondary-light dark:text-text-secondary-dark">Tel: {card.phone}</p>}
                    <p className="text-xs text-text-secondary-light dark:text-text-secondary-dark mt-0.5">Contato: {card.contact}</p>
                </div>
                <div className="flex items-center gap-1 ml-2">
                    {card.priority && (
                        <span className={`bg-${card.priorityColor}-50 dark:bg-${card.priorityColor}-900/30 text-${card.priorityColor}-600 dark:text-${card.priorityColor}-300 text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider shrink-0`}>
                            {card.priority}
                        </span>
                    )}
                </div>
            </div>
            {card.desc && (
                <p className="text-xs text-text-secondary-light dark:text-text-secondary-dark mb-2 line-clamp-2">{card.desc}</p>
            )}
            <div className="flex items-center justify-between mt-3 pt-2 border-t border-border-light/30 dark:border-border-dark">
                <span className="text-sm font-bold text-green-600 dark:text-green-400">{card.value}</span>
                <div className="flex items-center gap-1">
                    <button onClick={(e) => { e.stopPropagation(); onOpenChat(card.id); }} className="text-text-secondary-light hover:text-green-500 transition-colors p-1 rounded" title="Abrir Chat">
                        <span className="material-symbols-outlined text-lg">chat</span>
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); onOpenMenu(card.id, (e.currentTarget as HTMLButtonElement).getBoundingClientRect()); }} className="text-text-secondary-light hover:text-primary transition-colors p-1 rounded" title="Opções">
                        <span className="material-symbols-outlined text-lg">more_vert</span>
                    </button>
                </div>
            </div>
        </div>
    );
}

function SortableStageShell({
    stageId,
    children,
}: {
    stageId: string;
    children: (dragHandle: { attributes: any; listeners: any }) => React.ReactNode;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: stageId,
        data: { type: "stage" },
    });
    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.75 : 1,
    };
    return (
        <div ref={setNodeRef} style={style}>
            {children({ attributes, listeners })}
        </div>
    );
}

// Card overlay for dragging
function CardOverlay({ card }: { card: KanbanCard }) {
    return (
        <div data-kanban-card="true" className="bg-surface-light dark:bg-surface-dark p-4 rounded-lg shadow-2xl border-2 border-primary/40 w-[300px] rotate-2">
            <h3 className="text-sm font-bold">{card.name}</h3>
            <p className="text-xs text-text-secondary-light mt-1">Contato: {card.contact}</p>
            {card.phone && <p className="text-xs text-text-secondary-light">Tel: {card.phone}</p>}
            <span className="text-sm font-bold text-green-600 mt-2 block">{card.value}</span>
        </div>
    );
}

// Droppable Stage Component
function DroppableStage({ id, children, className }: { id: string, children: React.ReactNode, className?: string }) {
    const { setNodeRef } = useDroppable({ id });
    return (
        <div ref={setNodeRef} className={className} data-stage-id={id}>
            {children}
        </div>
    );
}

const PRIORITY_MAP: Record<string, { label: string; color: string }> = {
    alta: { label: "Alta", color: "red" },
    media: { label: "Média", color: "blue" },
    baixa: { label: "Baixa", color: "yellow" },
};

export default function KanbanPage() {
    const dndId = useId();
    const isFetchingKanbanRef = useRef(false);

    // State
    const [isMounted, setIsMounted] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [stages, setStages] = useState<KanbanStage[]>([]);
    const [cards, setCards] = useState<KanbanCard[]>([]);

    const fetchKanban = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
        if (isFetchingKanbanRef.current) return;
        isFetchingKanbanRef.current = true;
        if (!silent) setIsLoading(true);
        try {
            const token = localStorage.getItem("access_token") || undefined;
            const data = await api<{
                columns: Array<{
                    stage: string;
                    stage_id?: string;
                    stage_version?: number;
                    stage_is_conversion?: boolean;
                    label: string;
                    leads: Array<{
                        id: string;
                        company_name: string;
                        contact_name: string;
                        phone?: string | null;
                        value: number;
                        priority: string | null;
                        notes: string | null;
                        stage: string;
                        whatsapp_chat_id: string | null;
                        products_json?: any[];
                    }>;
                }>
            }>("/api/leads/kanban", { method: "GET", token });

            // Update stages state from columns
            const fetchedStages: KanbanStage[] = data.columns.map((col) => ({
                id: col.stage_id || `s-${col.stage}`,
                title: col.label,
                version: col.stage_version || 1,
                isConversion: Boolean(col.stage_is_conversion),
            }));
            setStages(fetchedStages);

            const allCards: KanbanCard[] = [];
            for (const col of data.columns) {
                const stageId = col.stage_id || `s-${col.stage}`;
                for (const lead of col.leads) {
                    const pri = lead.priority ? PRIORITY_MAP[lead.priority] : null;
                    allCards.push({
                        id: lead.id,
                        stageId,
                        name: lead.company_name,
                        contact: lead.contact_name,
                        phone: lead.phone || "",
                        value: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(lead.value || 0),
                        priority: pri?.label || "",
                        priorityColor: pri?.color || "",
                        desc: lead.notes || "",
                        products_json: lead.products_json || [],
                    });
                }
            }
            setCards(allCards);
        } catch (err) {
            console.error("Failed to fetch kanban data:", err);
        } finally {
            isFetchingKanbanRef.current = false;
            if (!silent) setIsLoading(false);
        }
    }, []);

    // Initial fetch + automatic refresh to keep new conversations updated
    useEffect(() => {
        setIsMounted(true);
        void fetchKanban();

        const refreshInterval = window.setInterval(() => {
            void fetchKanban({ silent: true });
        }, 5000);

        const handleWindowFocus = () => {
            void fetchKanban({ silent: true });
        };
        window.addEventListener("focus", handleWindowFocus);

        return () => {
            window.clearInterval(refreshInterval);
            window.removeEventListener("focus", handleWindowFocus);
        };
    }, [fetchKanban]);

    // Removed localStorage sync — data now comes from API


    const [viewMode, setViewMode] = useState<"kanban" | "list">("kanban");
    const [activeCard, setActiveCard] = useState<KanbanCard | null>(null);
    const [showNewStage, setShowNewStage] = useState(false);
    const [newStageName, setNewStageName] = useState("");
    const [showNewStageAsConversion, setShowNewStageAsConversion] = useState(false);
    const [showNewCard, setShowNewCard] = useState<string | null>(null);
    const [newCard, setNewCard] = useState<{
        name: string;
        contact: string;
        phone: string;
        value: string;
        priority: string;
        products_json: any[];
    }>({ name: "", contact: "", phone: "", value: "", priority: "Média", products_json: [] });
    const [showFilter, setShowFilter] = useState(false);
    const [filterPriority, setFilterPriority] = useState("");
    const [filterSort, setFilterSort] = useState("");
    const [showSearch, setShowSearch] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [showReport, setShowReport] = useState(false);
    const [reportData, setReportData] = useState<any>(null);
    const [isLoadingReport, setIsLoadingReport] = useState(false);
    const [showAddMenu, setShowAddMenu] = useState(false);
    const [editCardMenu, setEditCardMenu] = useState<string | null>(null);
    const [editCardMenuPosition, setEditCardMenuPosition] = useState<{ top: number; left: number } | null>(null);
    const [editingCard, setEditingCard] = useState<KanbanCard | null>(null);
    const [editSuggestedValue, setEditSuggestedValue] = useState("R$ 0,00");
    const [isManualValueConfirmed, setIsManualValueConfirmed] = useState(false);
    const [manualValueJustification, setManualValueJustification] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    const [isSavingStageOrder, setIsSavingStageOrder] = useState(false);
    const [isSavingCardMove, setIsSavingCardMove] = useState(false);
    const [editStage, setEditStage] = useState<string | null>(null);
    const [editStageName, setEditStageName] = useState("");
    const [lastReorderAttempt, setLastReorderAttempt] = useState<KanbanStage[] | null>(null);
    const dragInitialStageRef = useRef<Record<string, string>>({});
    const dragTargetStageRef = useRef<Record<string, string>>({});

    // Product data state
    const [availableProducts, setAvailableProducts] = useState<{ id: string, name: string, price: number }[]>([]);
    const [productFetchError, setProductFetchError] = useState<string | null>(null);
    const [editSelectedProductId, setEditSelectedProductId] = useState("");
    const [editSelectedQuantity, setEditSelectedQuantity] = useState<number | "">(1);

    // Formata o telefone para padrão BR: 55 DDD 9XXXX-XXXX
    const formatPhone = (val: string) => {
        let v = val.replace(/\D/g, '');
        if (!v) return "";
        // Auto-prefix DDI 55
        if (!v.startsWith('55') && v.length >= 10) v = '55' + v;
        // Enforce 9-digit mobile: insert 9 after DDD only if mobile (first digit 6-9)
        if (v.length === 12 && v.startsWith('55')) {
            const firstDigitAfterDDD = v[4];
            if (['6', '7', '8', '9'].includes(firstDigitAfterDDD)) {
                v = v.slice(0, 4) + '9' + v.slice(4);
            }
        }
        if (v.length > 13) v = v.substring(0, 13);

        if (v.length <= 2) return v;
        if (v.length <= 4) return v.replace(/^(\d{2})(\d{1,2})/, '$1 $2');
        if (v.length <= 9) return v.replace(/^(\d{2})(\d{2})(\d{1,5})/, '$1 $2 $3');
        return v.replace(/^(\d{2})(\d{2})(\d{5})(\d{0,4})/, '$1 $2 $3-$4');
    };

    // Fetch products
    useEffect(() => {
        async function fetchProducts() {
            try {
                setProductFetchError(null);
                const token = localStorage.getItem("access_token") || undefined;
                const data = await api<any[]>("/api/products/", { method: "GET", token });
                if (Array.isArray(data)) {
                    setAvailableProducts(data.filter(p => p.is_active));
                }
            } catch (err) {
                console.error("Failed to load products", err);
                setProductFetchError(`Erro ao carregar lista de produtos: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
        fetchProducts();
    }, []);

    // Chat modal state (reuses shared WhatsAppChat component)
    const [chatConfig, setChatConfig] = useState<{ leadId: string; leadName: string } | null>(null);
    // Delete confirmation state
    const [deleteCardId, setDeleteCardId] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const filterRef = useRef<HTMLDivElement>(null);

    // Open chat modal
    function openChat(cardId: string) {
        const card = cards.find(c => c.id === cardId);
        if (!card) return;
        setChatConfig({ leadId: cardId, leadName: `${card.contact} - ${card.name}` });
    }

    const handleOpenReport = async () => {
        setShowReport(true);
        setIsLoadingReport(true);
        try {
            const parseCardCurrency = (val: string) => {
                if (!val) return 0;
                const cleanObj = val.replace(/[^\d,-]/g, '').replace(',', '.');
                return parseFloat(cleanObj) || 0;
            };

            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            const { data: profile } = await supabase.from("profiles").select("tenant_id").eq("id", user.id).single();
            const tenantId = profile?.tenant_id || user.id;

            // Date Filtering: First day of current month
            const now = new Date();
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

            // Query por stage agrupando leads:
            const { data: stagesData, error: stagesError } = await supabase
                .from('pipeline_stages')
                .select('id, name, order_position')
                .eq('tenant_id', tenantId)
                .order('order_position');

            if (stagesError) throw stagesError;

            // Only fetch orders created this month and paid
            const { data: ordersData, error: ordersError } = await supabase
                .from('orders')
                .select('products_json')
                .eq('tenant_id', tenantId)
                .eq('payment_status', 'pago')
                .gte('created_at', startOfMonth);

            if (ordersError) throw ordersError;

            // Report should reflect current Kanban cards/values shown in UI.
            // Prefer current UI stage order and labels; fallback to DB stage list if needed.
            const uiStages = stages.map((s, index) => ({ id: s.id, name: s.title, order_position: index }));
            const sData = uiStages.length > 0
                ? uiStages
                : (stagesData || []).map((s: any, index: number) => ({
                    id: s.id,
                    name: s.name,
                    order_position: typeof s.order_position === "number" ? s.order_position : index,
                }));

            const report = sData.map((s: any) => {
                const leadsInStage = cards.filter((c) => c.stageId === s.id);
                return {
                    stage: s.name,
                    count: leadsInStage.length,
                    total: leadsInStage.reduce((a: number, l: any) => a + parseCardCurrency(l.value), 0)
                };
            });

            // Calculate conversion rate using explicit conversion stages.
            const conversionStageIds = new Set(stages.filter((s) => s.isConversion).map((s) => s.id));
            const initialCount = cards.length;
            const confirmedCount = cards.reduce((sum, card) => sum + (conversionStageIds.has(card.stageId) ? 1 : 0), 0);
            const conversionRate = initialCount > 0 ? ((confirmedCount / initialCount) * 100).toFixed(1) + '%' : '0%';

            const totalLeads = cards.length;
            const activeLeads = cards.length;
            const totalValue = report.reduce((a: number, s: any) => a + s.total, 0);

            // Product sales aggregation
            const productSales: Record<string, number> = {};
            if (ordersData) {
                for (const order of ordersData) {
                    const prods = order.products_json || [];
                    for (const p of prods) {
                        const qty = Number(p.quantity || p.qty || 0);
                        if (p.name && qty > 0) {
                            productSales[p.name] = (productSales[p.name] || 0) + qty;
                        }
                    }
                }
            }
            const topProducts = Object.entries(productSales)
                .map(([name, sales]) => ({ name, sales }))
                .sort((a, b) => b.sales - a.sales)
                .slice(0, 5);

            setReportData({
                totalLeads,
                activeLeads,
                totalValue,
                conversionRate,
                stages: report,
                products: topProducts
            });
        } catch (err: any) {
            console.error("Failed to fetch report data:", err);
            // Optionally set an error state here if UI should show it
        } finally {
            setIsLoadingReport(false);
        }
    };

    // Export CSV:
    const handleDownloadCSV = () => {
        if (!reportData) return;
        const totalGeral = reportData.totalValue;
        const headers = ['Etapa', 'Qtd. Negócios', 'Valor Total', '% do Total'];
        const escapeCSV = (val: string) => `"${String(val).replace(/"/g, '""')}"`;

        const rows = reportData.stages.map((r: any) => [
            escapeCSV(r.stage),
            r.count,
            r.total.toFixed(2),
            totalGeral > 0 ? escapeCSV(((r.total / totalGeral) * 100).toFixed(1) + '%') : escapeCSV('0%')
        ]);
        const csv = '\uFEFF' + [headers.map(escapeCSV), ...rows].map((r: any[]) => r.join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `relatorio_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
    };

    // Delete lead handler
    async function handleDeleteCard() {
        if (!deleteCardId) return;
        setIsDeleting(true);
        try {
            const token = localStorage.getItem("access_token") || undefined;
            await api(`/api/leads/${deleteCardId}`, { method: "DELETE", token });
            setCards(prev => prev.filter(c => c.id !== deleteCardId));
        } catch (err) {
            console.error("Failed to delete card:", err);
        } finally {
            setIsDeleting(false);
            setDeleteCardId(null);
        }
    }

    // Drag to scroll logic
    const boardRef = useRef<HTMLDivElement>(null);
    const draggingRef = useRef({ isDragging: false, startX: 0, scrollLeft: 0 });

    const onMouseDown = (e: React.MouseEvent) => {
        if ((e.target as HTMLElement).closest('[data-kanban-card]')) return;
        draggingRef.current.isDragging = true;
        draggingRef.current.startX = e.pageX - boardRef.current!.offsetLeft;
        draggingRef.current.scrollLeft = boardRef.current!.scrollLeft;
    };
    const onMouseMove = (e: React.MouseEvent) => {
        if (!draggingRef.current.isDragging) return;
        e.preventDefault();
        boardRef.current!.scrollLeft = draggingRef.current.scrollLeft - (e.pageX - boardRef.current!.offsetLeft - draggingRef.current.startX) * 1.5;
    };
    const onMouseUp = () => { draggingRef.current.isDragging = false; };

    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setEditCardMenu(null);
                setEditCardMenuPosition(null);
                setShowAddMenu(false);
            }
            if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
                setShowFilter(false);
            }
        }
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, []);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
    );

    // Filter & search
    const filteredCards = cards.filter((c) => {
        if (filterPriority && c.priority !== filterPriority) return false;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            return c.name.toLowerCase().includes(q) || c.contact.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q);
        }
        return true;
    }).sort((a, b) => {
        if (filterSort === "oldest") return a.id.localeCompare(b.id);
        if (filterSort === "newest") return b.id.localeCompare(a.id);
        return 0;
    });
    const activeMenuCard = editCardMenu ? cards.find((c) => c.id === editCardMenu) || null : null;

    const parseCurrency = (val: string) => {
        if (!val) return 0;
        const cleanObj = val.replace(/[^\d,-]/g, '').replace(',', '.');
        return parseFloat(cleanObj) || 0;
    };

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
    };

    const computeProductsTotal = (items: any[] = []) => {
        return items.reduce((sum, p) => {
            const qty = Number(p.quantity ?? p.qty ?? 1);
            const lineTotal = typeof p.line_total === "number" ? Number(p.line_total) : Number(p.price || 0) * qty;
            return sum + (Number.isFinite(lineTotal) ? lineTotal : 0);
        }, 0);
    };

    const openEditCard = (card: KanbanCard) => {
        const suggested = computeProductsTotal(card.products_json || []);
        setEditingCard(card);
        setEditSuggestedValue(formatCurrency(suggested));
        setIsManualValueConfirmed(false);
        setManualValueJustification("");
    };

    // DnD handlers
    function handleDragStart(event: DragStartEvent) {
        if (event.active.data.current?.type !== "card") return;
        const card = cards.find((c) => c.id === event.active.id);
        if (card) {
            setActiveCard(card);
            dragInitialStageRef.current[card.id] = card.stageId;
            dragTargetStageRef.current[card.id] = card.stageId;
        }
    }

    function handleDragOver(event: DragOverEvent) {
        const { active, over } = event;
        if (active.data.current?.type !== "card") return;
        const activeCardId = active.id as string;
        const activeCardObj = cards.find((c) => c.id === activeCardId);
        if (!activeCardObj) return;

        const overId = over?.id as string | undefined;
        const resolvedOverId = overId;
        if (!resolvedOverId) return;

        // Dropping over a stage directly
        const targetStage = stages.find((s) => s.id === resolvedOverId);
        if (targetStage && activeCardObj.stageId !== resolvedOverId) {
            dragTargetStageRef.current[activeCardId] = resolvedOverId;
            setCards((prev) => prev.map((c) => c.id === activeCardId ? { ...c, stageId: resolvedOverId } : c));
            return;
        }

        // Dropping over another card
        const overCard = cards.find((c) => c.id === resolvedOverId);
        if (overCard && activeCardObj.stageId !== overCard.stageId) {
            dragTargetStageRef.current[activeCardId] = overCard.stageId;
            setCards((prev) => prev.map((c) => c.id === activeCardId ? { ...c, stageId: overCard.stageId } : c));
        }
    }

    async function persistStageOrder(nextStages: KanbanStage[], previousStages: KanbanStage[]) {
        setIsSavingStageOrder(true);
        try {
            const token = localStorage.getItem("access_token") || undefined;
            const payload = { items: nextStages.map((s) => ({ id: s.id, version: s.version || 1 })) };
            const response = await api<{ stages: Array<{ id: string; version: number }> }>("/api/leads/stages/reorder", {
                method: "POST",
                body: JSON.stringify(payload),
                token
            });
            const versions = new Map((response.stages || []).map((s) => [s.id, s.version || 1]));
            setStages(nextStages.map((s) => ({ ...s, version: versions.get(s.id) || s.version || 1 })));
            setLastReorderAttempt(null);
        } catch (err: any) {
            setStages(previousStages);
            setLastReorderAttempt(nextStages);
            const retry = window.confirm(`Falha ao salvar ordem das etapas (${err?.message || "erro"}). Tentar novamente?`);
            if (retry) {
                await persistStageOrder(nextStages, previousStages);
            }
        } finally {
            setIsSavingStageOrder(false);
        }
    }

    async function persistCardStageMove(cardId: string, previousStageId: string, newStageId: string, newStageName: string) {
        setIsSavingCardMove(true);
        try {
            const token = localStorage.getItem("access_token") || undefined;
            await api(`/api/leads/${cardId}/stage`, {
                method: "PATCH",
                body: JSON.stringify({ stage: newStageName, stage_id: newStageId }),
                token,
                // Helps the PATCH complete if the user refreshes quickly.
                keepalive: true,
            });
        } catch (err) {
            console.warn("Failed to sync stage move:", err);
            setCards((prev) => prev.map((c) => c.id === cardId ? { ...c, stageId: previousStageId } : c));
            alert(`Falha ao mover card: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
            setIsSavingCardMove(false);
        }
    }

    function handleDragEnd(event: DragEndEvent) {
        setActiveCard(null);
        const { active, over } = event;
        const activeType = active.data.current?.type;

        if (activeType === "stage") {
            if (!over || active.id === over.id) return;
            const oldIndex = stages.findIndex((s) => s.id === active.id);
            const newIndex = stages.findIndex((s) => s.id === over.id);
            if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;
            const previous = [...stages];
            const next = arrayMove(stages, oldIndex, newIndex);
            setStages(next);
            void persistStageOrder(next, previous);
            return;
        }

        const activeCardObj = cards.find((c) => c.id === active.id);
        if (!activeCardObj) return;

        const overCardObj = over ? cards.find((c) => c.id === over.id) : undefined;
        if (activeCardObj && overCardObj && activeCardObj.stageId === overCardObj.stageId) {
            const stageCards = cards.filter((c) => c.stageId === activeCardObj.stageId);
            const oldIdx = stageCards.findIndex((c) => c.id === active.id);
            const newIdx = stageCards.findIndex((c) => c.id === overCardObj.id);
            const reordered = arrayMove(stageCards, oldIdx, newIdx);
            setCards((prev) => {
                const others = prev.filter((c) => c.stageId !== activeCardObj.stageId);
                return [...others, ...reordered];
            });
        }

        // Sync stage change with backend
        if (activeCardObj) {
            const previousStageId = dragInitialStageRef.current[activeCardObj.id] || activeCardObj.stageId;
            const overStage = over ? stages.find((s) => s.id === over.id) : undefined;
            const resolvedTargetStageId =
                dragTargetStageRef.current[activeCardObj.id] ||
                (overStage ? overStage.id : undefined) ||
                (overCardObj ? overCardObj.stageId : undefined) ||
                activeCardObj.stageId;
            const newStageId = resolvedTargetStageId;
            const targetStage = stages.find(s => s.id === newStageId);
            const newStageName = targetStage ? targetStage.title : newStageId.replace(/^s-/, '');

            if (newStageId && newStageId !== activeCardObj.stageId) {
                // Ensure local UI reflects final target before network sync.
                setCards((prev) => prev.map((c) => c.id === activeCardObj.id ? { ...c, stageId: newStageId } : c));
            }

            if (newStageName && newStageId !== previousStageId) {
                void persistCardStageMove(activeCardObj.id, previousStageId, newStageId, newStageName);
            }
            delete dragInitialStageRef.current[activeCardObj.id];
            delete dragTargetStageRef.current[activeCardObj.id];
        }
    }

    // Actions
    async function addStage() {
        if (!newStageName.trim()) return;
        const name = newStageName.trim();
        try {
            const token = localStorage.getItem("access_token") || undefined;
            const created = await api<{ id: string; name: string; order_position: number; version: number; is_conversion?: boolean }>("/api/leads/stages", {
                method: "POST",
                body: JSON.stringify({ name, is_conversion: showNewStageAsConversion }),
                token,
            });
            setStages([...stages, { id: created.id, title: created.name, version: created.version || 1, isConversion: Boolean(created.is_conversion) }]);
            setNewStageName("");
            setShowNewStageAsConversion(false);
            setShowNewStage(false);
        } catch (err) {
            console.error("Failed to add stage:", err);
            alert(`Falha ao criar etapa: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    async function deleteStage(stageId: string) {
        if (stages.length <= 1) {
            alert("Você precisa manter pelo menos uma etapa no Kanban.");
            return;
        }
        const stageToDelete = stages.find((s) => s.id === stageId);
        if (!stageToDelete) return;

        const fallbackStage = stages.find((s) => s.id !== stageId);
        if (!fallbackStage) return;

        const stageCards = cards.filter((c) => c.stageId === stageId);
        const confirmed = window.confirm(
            stageCards.length > 0
                ? `Excluir etapa "${stageToDelete.title}"? ${stageCards.length} card(s) serão movidos para "${fallbackStage.title}".`
                : `Excluir etapa "${stageToDelete.title}"?`
        );
        if (!confirmed) return;

        try {
            const token = localStorage.getItem("access_token") || undefined;
            const response = await api<{ fallback_stage_id: string; stages: Array<{ id: string; name: string; version?: number; is_conversion?: boolean }> }>(`/api/leads/stages/${stageId}`, {
                method: "DELETE",
                body: JSON.stringify({ fallback_stage_id: fallbackStage.id }),
                token,
            });

            setCards((prev) => prev.map((c) => (c.stageId === stageId ? { ...c, stageId: response.fallback_stage_id } : c)));
            setStages(response.stages.map((s) => ({ id: s.id, title: s.name, version: s.version || 1, isConversion: Boolean(s.is_conversion) })));
            if (showNewCard === stageId) setShowNewCard(null);
        } catch (err) {
            console.error("Failed to delete stage:", err);
            alert(`Erro ao excluir etapa: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    async function addCard(stageId: string) {
        if (!newCard.name.trim()) return;
        const token = localStorage.getItem("access_token") || undefined;
        const targetStage = stages.find(s => s.id === stageId);
        const stageName = targetStage ? targetStage.title : stageId.replace(/^s-/, '');
        const priorityApiMap: Record<string, string> = { Alta: "alta", Média: "media", Baixa: "baixa" };
        const priorityColorMap: Record<string, string> = { Alta: "red", Média: "blue", Baixa: "yellow", OK: "green" };

        try {
            const created = await api<{ id: string; company_name: string; contact_name: string; phone: string | null; value: number; priority: string | null; notes: string | null; products_json?: any[] }>("/api/leads", {
                method: "POST",
                body: JSON.stringify({
                    company_name: newCard.name,
                    contact_name: newCard.contact || newCard.name,
                    phone: newCard.phone || undefined,
                    stage: stageName,
                    value: parseCurrency(newCard.value),
                    priority: priorityApiMap[newCard.priority] || null,
                    products_json: newCard.products_json,
                }),
                token
            });

            setCards([...cards, {
                id: created.id, stageId, name: newCard.name, contact: newCard.contact || newCard.name,
                phone: newCard.phone,
                value: formatCurrency(Number(created.value || 0)), priority: newCard.priority,
                priorityColor: priorityColorMap[newCard.priority] || "blue", desc: "",
                products_json: created.products_json || newCard.products_json,
            }]);
        } catch (err) {
            console.error("Failed to create lead:", err);
            // Fallback: add locally anyway
            const id = `c${crypto.randomUUID()}`;
            setCards([...cards, {
                id, stageId, name: newCard.name, contact: newCard.contact,
                phone: newCard.phone,
                value: newCard.value || "R$ 0,00", priority: newCard.priority,
                priorityColor: priorityColorMap[newCard.priority] || "blue", desc: "",
            }]);
        }
        setNewCard({ name: "", contact: "", phone: "", value: "", priority: "Média", products_json: [] });
        setShowNewCard(null);
    }

    async function renameStage(stageId: string) {
        if (!editStageName.trim()) return;
        const nextName = editStageName.trim();
        const previousStages = [...stages];
        setStages(stages.map((s) => s.id === stageId ? { ...s, title: nextName } : s));
        setEditStage(null);
        setEditStageName("");
        try {
            const token = localStorage.getItem("access_token") || undefined;
            const updated = await api<{ id: string; name: string; version?: number }>(`/api/leads/stages/${stageId}`, {
                method: "PATCH",
                body: JSON.stringify({ name: nextName }),
                token,
            });
            setStages((prev) => prev.map((s) => s.id === stageId ? { ...s, title: updated.name, version: updated.version || s.version } : s));
        } catch (err) {
            setStages(previousStages);
            alert(`Falha ao renomear etapa: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    async function handleSaveEditCard() {
        if (!editingCard) return;
        setIsSaving(true);
        try {
            const token = localStorage.getItem("access_token") || undefined;

            const priorityMap: Record<string, string> = { Alta: "alta", Média: "media", Baixa: "baixa" };
            const payload = {
                company_name: editingCard.name,
                contact_name: editingCard.contact,
                phone: editingCard.phone || undefined,
                priority: priorityMap[editingCard.priority],
                value: parseCurrency(editingCard.value),
                notes: editingCard.desc,
                products_json: editingCard.products_json || [],
            };
            const currentValue = parseCurrency(editingCard.value);
            const suggestedValue = parseCurrency(editSuggestedValue);
            const hasManualAdjustment = Math.abs(currentValue - suggestedValue) > 0.009;
            if (hasManualAdjustment) {
                if (!isManualValueConfirmed || !manualValueJustification.trim()) {
                    alert("Para salvar valor manual, informe justificativa e clique em confirmar ajuste.");
                    return;
                }
                const manualAudit = `[Ajuste manual de valor] De ${formatCurrency(suggestedValue)} para ${formatCurrency(currentValue)}. Justificativa: ${manualValueJustification.trim()}`;
                payload.notes = [editingCard.desc?.trim(), manualAudit].filter(Boolean).join("\n");
            }

            // Call the PATCH endpoint to sync with Uazapi
            try {
                // Ignore any 400 errors if it's a mocked local card "c1" "c2" that isn't in DB yet
                const updatedFromApi = await api<{ id: string; value: number; products_json?: any[] }>(`/api/leads/${editingCard.id}`, {
                    method: 'PATCH',
                    body: JSON.stringify(payload),
                    token
                });
                const priorityColorMap: Record<string, string> = { Alta: "red", Média: "blue", Baixa: "yellow", OK: "green" };
                const updatedCard = {
                    ...editingCard,
                    value: formatCurrency(Number(updatedFromApi?.value || 0)),
                    products_json: updatedFromApi?.products_json || editingCard.products_json || [],
                    priorityColor: priorityColorMap[editingCard.priority] || "gray",
                };
                setCards(cards.map(c => c.id === updatedCard.id ? updatedCard : c));
                setEditingCard(null);
                setIsManualValueConfirmed(false);
                setManualValueJustification("");
                return;
            } catch (err) {
                console.warn("API update failed, could be mocked card:", err);
            }

            // Sync color logic
            const priorityColorMap: Record<string, string> = { Alta: "red", Média: "blue", Baixa: "yellow", OK: "green" };
            const updatedCard = { ...editingCard, priorityColor: priorityColorMap[editingCard.priority] || "gray" };

            setCards(cards.map(c => c.id === updatedCard.id ? updatedCard : c));
            setEditingCard(null);
            setIsManualValueConfirmed(false);
            setManualValueJustification("");
        } catch (error) {
            console.error("Failed to save edited card:", error);
            // Even if failed, update local UI for demo purposes
            const priorityColorMap: Record<string, string> = { Alta: "red", Média: "blue", Baixa: "yellow", OK: "green" };
            const updatedCard = { ...editingCard, priorityColor: priorityColorMap[editingCard.priority] || "gray" };
            setCards(cards.map(c => c.id === updatedCard.id ? updatedCard : c));
            setEditingCard(null);
            setIsManualValueConfirmed(false);
            setManualValueJustification("");
        } finally {
            setIsSaving(false);
        }
    }

    // Auto-calculate value from products (with promotion-adjusted line_total when present)
    useEffect(() => {
        if (editingCard && editingCard.products_json && editingCard.products_json.length > 0) {
            const total = computeProductsTotal(editingCard.products_json);
            const hasPricingMetadata = editingCard.products_json.some(
                (p: any) =>
                    typeof p.line_total === "number" ||
                    typeof p.line_discount === "number" ||
                    Boolean(p.applied_promotion_name)
            );
            const suggestedNumber = hasPricingMetadata ? total : parseCurrency(editingCard.value);
            const formatted = formatCurrency(suggestedNumber);
            setEditSuggestedValue(formatted);
            if (hasPricingMetadata && !isManualValueConfirmed && editingCard.value !== formatted) {
                setEditingCard({ ...editingCard, value: formatted });
            }
        } else if (editingCard) {
            setEditSuggestedValue(formatCurrency(parseCurrency(editingCard.value)));
        }
    }, [editingCard?.products_json, isManualValueConfirmed]);

    useEffect(() => {
        if (newCard.products_json && newCard.products_json.length > 0) {
            const total = computeProductsTotal(newCard.products_json);
            const formatted = formatCurrency(total);
            if (newCard.value !== formatted) {
                setNewCard({ ...newCard, value: formatted });
            }
        }
    }, [newCard.products_json]);

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <header className="bg-surface-light dark:bg-surface-dark border-b border-border-light dark:border-border-dark h-14 flex items-center justify-between px-6 flex-shrink-0 z-10">
                <div className="flex items-center gap-3">
                    {/* Filter */}
                    <div className="relative" ref={filterRef}>
                        <button onClick={() => setShowFilter(!showFilter)} className="inline-flex items-center px-3 py-1.5 border border-border-light dark:border-border-dark text-sm font-medium rounded-lg bg-surface-light dark:bg-surface-dark hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                            <span className="material-symbols-outlined text-base mr-1.5 text-text-secondary-light">filter_list</span>
                            Filtro
                        </button>
                        {showFilter && (
                            <div className="absolute top-full left-0 mt-1 w-56 bg-surface-light dark:bg-surface-dark rounded-xl shadow-2xl border border-border-light dark:border-border-dark z-50 p-3 space-y-3">
                                <div>
                                    <p className="text-[10px] font-semibold text-text-secondary-light uppercase tracking-wider mb-1">Prioridade</p>
                                    {["", "Alta", "Média", "Baixa"].map((p) => (
                                        <button key={p || "all"} onClick={() => setFilterPriority(p)}
                                            className={`block w-full text-left px-2 py-1.5 text-sm rounded-lg ${filterPriority === p ? "bg-primary/10 text-primary font-medium" : "hover:bg-slate-50 dark:hover:bg-slate-800"}`}>
                                            {p || "Todas"}
                                        </button>
                                    ))}
                                </div>
                                <div className="border-t border-border-light dark:border-border-dark pt-2">
                                    <p className="text-[10px] font-semibold text-text-secondary-light uppercase tracking-wider mb-1">Ordenar</p>
                                    {[{ v: "", l: "Padrão" }, { v: "newest", l: "Mais recente" }, { v: "oldest", l: "Mais antigo" }].map(({ v, l }) => (
                                        <button key={v} onClick={() => setFilterSort(v)}
                                            className={`block w-full text-left px-2 py-1.5 text-sm rounded-lg ${filterSort === v ? "bg-primary/10 text-primary font-medium" : "hover:bg-slate-50 dark:hover:bg-slate-800"}`}>
                                            {l}
                                        </button>
                                    ))}
                                </div>
                                <button onClick={() => { setFilterPriority(""); setFilterSort(""); setShowFilter(false); }} className="text-xs text-primary hover:underline w-full text-center pt-1">Limpar filtros</button>
                            </div>
                        )}
                    </div>
                    {/* Search */}
                    {showSearch ? (
                        <div className="relative">
                            <input autoFocus value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-8 pr-8 py-1.5 border border-border-light dark:border-border-dark rounded-lg text-sm bg-surface-light dark:bg-surface-dark w-64 focus:ring-primary focus:border-primary"
                                placeholder="Buscar clientes, produtos, negócios..." />
                            <span className="material-symbols-outlined absolute left-2 top-2 text-text-secondary-light text-base">search</span>
                            <button onClick={() => { setShowSearch(false); setSearchQuery(""); }} className="absolute right-2 top-2 text-text-secondary-light hover:text-text-main-light">
                                <span className="material-symbols-outlined text-base">close</span>
                            </button>
                        </div>
                    ) : (
                        <button onClick={() => setShowSearch(true)} className="inline-flex items-center px-3 py-1.5 border border-border-light dark:border-border-dark text-sm font-medium rounded-lg bg-surface-light dark:bg-surface-dark hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                            Buscar
                        </button>
                    )}
                </div>
                <div className="flex items-center gap-3">
                    {lastReorderAttempt && (
                        <button
                            onClick={() => { void persistStageOrder(lastReorderAttempt, [...stages]); }}
                            className="text-xs px-2 py-1 rounded border border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100"
                        >
                            Repetir reorder
                        </button>
                    )}
                    {/* View toggle */}
                    <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5 border border-border-light dark:border-border-dark">
                        <button onClick={() => setViewMode("kanban")} className={`p-1.5 rounded-md transition-colors ${viewMode === "kanban" ? "bg-white dark:bg-slate-600 shadow-sm text-primary" : "text-text-secondary-light"}`}>
                            <span className="material-symbols-outlined text-xl">view_kanban</span>
                        </button>
                        <button onClick={() => setViewMode("list")} className={`p-1.5 rounded-md transition-colors ${viewMode === "list" ? "bg-white dark:bg-slate-600 shadow-sm text-primary" : "text-text-secondary-light"}`}>
                            <span className="material-symbols-outlined text-xl">format_list_bulleted</span>
                        </button>
                    </div>
                    {/* Report */}
                    <button onClick={handleOpenReport} className="flex items-center text-sm font-medium text-text-secondary-light hover:text-primary transition-colors">
                        <span className="material-symbols-outlined mr-1 text-lg">trending_up</span>
                        Relatório
                    </button>
                    {/* Add menu */}
                    <div className="relative" ref={showAddMenu ? menuRef : null}>
                        <button onClick={() => setShowAddMenu(!showAddMenu)} className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg text-white bg-primary hover:bg-primary-hover transition-colors shadow-sm">
                            <span className="material-symbols-outlined mr-1 text-lg">add</span>
                            Adicionar
                        </button>
                        {showAddMenu && (
                            <div className="absolute right-0 top-full mt-1 w-48 bg-surface-light dark:bg-surface-dark rounded-xl shadow-2xl border border-border-light dark:border-border-dark z-50 py-1">
                                <button onClick={() => { setShowNewCard(stages[0]?.id || ""); setShowAddMenu(false); }}
                                    className="w-full px-4 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 text-text-main-light dark:text-text-main-dark">
                                    <span className="material-symbols-outlined text-base">person_add</span> Novo Negócio
                                </button>
                                <button onClick={() => { setShowNewStage(true); setShowNewStageAsConversion(false); setShowAddMenu(false); }}
                                    className="w-full px-4 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 text-text-main-light dark:text-text-main-dark">
                                    <span className="material-symbols-outlined text-base">view_column</span> Nova Etapa
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </header>

            {/* Main content */}
            {isLoading ? (
                <div className="flex-1 flex items-center justify-center">
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto mb-3"></div>
                        <p className="text-sm text-text-secondary-light dark:text-text-secondary-dark">Carregando leads...</p>
                    </div>
                </div>
            ) : viewMode === "kanban" ? (
                <DndContext id={dndId} sensors={sensors} collisionDetection={pointerWithin} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
                    <div
                        className="flex-1 overflow-x-auto overflow-y-hidden p-6 cursor-grab active:cursor-grabbing"
                        ref={boardRef}
                        onMouseDown={onMouseDown}
                        onMouseMove={onMouseMove}
                        onMouseUp={onMouseUp}
                        onMouseLeave={onMouseUp}
                    >
                        <SortableContext items={stages.map((s) => s.id)} strategy={horizontalListSortingStrategy}>
                        <div className="flex h-full gap-5 min-w-max pb-4">
                            {stages.map((stage) => {
                                const stageCards = filteredCards.filter((c) => c.stageId === stage.id);
                                return (
                                    <SortableStageShell key={stage.id} stageId={stage.id}>
                                    {({ attributes, listeners }) => (
                                    <div data-stage-id={stage.id} className="w-[310px] flex flex-col flex-shrink-0 bg-slate-50/50 dark:bg-slate-800/30 rounded-xl border border-border-light/60 dark:border-border-dark/60">
                                        {/* Stage header */}
                                        <div className="p-3 flex items-center justify-between border-b border-border-light/50 dark:border-border-dark/50">
                                            <div className="flex items-center gap-2 flex-1 min-w-0">
                                                <button
                                                    type="button"
                                                    {...attributes}
                                                    {...listeners}
                                                    className="text-text-secondary-light hover:text-primary cursor-grab active:cursor-grabbing"
                                                    title="Arrastar etapa"
                                                >
                                                    <span className="material-symbols-outlined text-base">drag_indicator</span>
                                                </button>
                                                {editStage === stage.id ? (
                                                    <form onSubmit={(e) => { e.preventDefault(); void renameStage(stage.id); }} className="flex items-center gap-2 flex-1 min-w-0">
                                                        <input autoFocus value={editStageName} onChange={(e) => setEditStageName(e.target.value)}
                                                            className="text-sm font-semibold border border-primary rounded-lg px-2 py-1 bg-white dark:bg-surface-dark flex-1 min-w-0 focus:outline-none focus:ring-1 focus:ring-primary"
                                                            onBlur={() => { void renameStage(stage.id); }} />
                                                        {stage.isConversion && (
                                                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 font-semibold uppercase tracking-wide shrink-0">
                                                                Conversão
                                                            </span>
                                                        )}
                                                    </form>
                                                ) : (
                                                    <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
                                                        <span
                                                            onClick={() => { setEditStage(stage.id); setEditStageName(stage.title); }}
                                                            className="text-sm font-semibold truncate hover:text-primary transition-colors cursor-pointer block min-w-0 flex-1"
                                                            title={stage.title}
                                                        >
                                                            {stage.title}
                                                        </span>
                                                        {stage.isConversion && (
                                                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 font-semibold uppercase tracking-wide shrink-0">
                                                                Conversão
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2 text-xs text-text-secondary-light shrink-0 ml-2">
                                                <span className="bg-primary-light dark:bg-primary/20 text-primary font-medium px-2 py-0.5 rounded-full">
                                                    {stageCards.length}
                                                </span>
                                                {isSavingStageOrder && <span className="mr-1 text-[10px]">Salvando</span>}
                                                {isSavingCardMove && <span className="mr-1 text-[10px]">Movendo</span>}
                                                {formatCurrency(stageCards.reduce((acc, c) => acc + parseCurrency(c.value), 0))}
                                                <button
                                                    onClick={() => { void deleteStage(stage.id); }}
                                                    className="ml-1 p-0.5 hover:bg-red-100 dark:hover:bg-red-900/20 rounded-full text-red-500"
                                                    title="Excluir etapa"
                                                >
                                                    <span className="material-symbols-outlined text-lg">delete</span>
                                                </button>
                                                <button onClick={() => { setShowNewStage(true); setShowNewStageAsConversion(false); }} className="ml-1 p-0.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full text-primary" title="Nova etapa">
                                                    <span className="material-symbols-outlined text-lg">add</span>
                                                </button>
                                            </div>
                                        </div>
                                        {/* Cards */}
                                        <SortableContext items={stageCards.map((c) => c.id)} strategy={verticalListSortingStrategy} id={stage.id}>
                                            <DroppableStage id={stage.id} className="flex-1 p-3 overflow-y-auto space-y-2.5 custom-scrollbar min-h-[100px]">
                                                {stageCards.map((card) => (
                                                    <div key={card.id} className="relative">
                                                        <SortableCard
                                                            card={card}
                                                            onOpenChat={(id) => openChat(id)}
                                                            onOpenMenu={(id, anchor) => {
                                                                if (editCardMenu === id) {
                                                                    setEditCardMenu(null);
                                                                    setEditCardMenuPosition(null);
                                                                    return;
                                                                }
                                                                setEditCardMenu(id);
                                                                setEditCardMenuPosition({
                                                                    top: Math.round(anchor.bottom + 6),
                                                                    left: Math.max(8, Math.round(anchor.right - 192)),
                                                                });
                                                            }}
                                                        />
                                                    </div>
                                                ))}
                                            </DroppableStage>
                                        </SortableContext>
                                        {/* Add card */}
                                        <div className="p-3 border-t border-border-light/50 dark:border-border-dark/50 bg-slate-50/50 dark:bg-slate-800/30">
                                            {showNewCard === stage.id ? (
                                                <div className="bg-surface-light dark:bg-surface-dark p-3 rounded-lg border border-primary/40 shadow-sm space-y-2">
                                                    <input value={newCard.name} onChange={(e) => setNewCard({ ...newCard, name: e.target.value })} placeholder="Nome do negócio" className="w-full px-3 py-1.5 border border-border-light dark:border-border-dark rounded-lg text-sm bg-white dark:bg-slate-800 focus:ring-1 focus:ring-primary focus:border-transparent" />
                                                    <input value={newCard.contact} onChange={(e) => setNewCard({ ...newCard, contact: e.target.value })} placeholder="Nome do contato" className="w-full px-3 py-1.5 border border-border-light dark:border-border-dark rounded-lg text-sm bg-white dark:bg-slate-800 focus:ring-1 focus:ring-primary focus:border-transparent" />
                                                    <input value={newCard.phone} onChange={(e) => setNewCard({ ...newCard, phone: formatPhone(e.target.value) })} placeholder="55 41 99999-9999" maxLength={16} className="w-full px-3 py-1.5 border border-border-light dark:border-border-dark rounded-lg text-sm bg-white dark:bg-slate-800 focus:ring-1 focus:ring-primary focus:border-transparent" />
                                                    <div className="flex gap-2">
                                                        <input value={newCard.value} onChange={(e) => setNewCard({ ...newCard, value: e.target.value })} placeholder="R$ 0,00" className="flex-1 px-3 py-1.5 border border-border-light dark:border-border-dark rounded-lg text-sm bg-white dark:bg-slate-800 focus:ring-1 focus:ring-primary focus:border-transparent" />
                                                        <select value={newCard.priority} onChange={(e) => setNewCard({ ...newCard, priority: e.target.value })} className="px-2 py-1.5 border border-border-light dark:border-border-dark rounded-lg text-sm bg-white dark:bg-slate-800">
                                                            <option>Alta</option><option>Média</option><option>Baixa</option>
                                                        </select>
                                                    </div>
                                                    {/* New Card Products Section */}
                                                    <div className="border-t border-border-light/50 dark:border-border-dark/50 pt-2 mt-2">
                                                        <p className="text-[10px] font-bold text-text-secondary-light uppercase mb-2">Produtos</p>
                                                        <div className="flex gap-1 mb-2">
                                                            <select value={editSelectedProductId} onChange={e => setEditSelectedProductId(e.target.value)} className="flex-1 px-2 py-1 border border-border-light dark:border-border-dark rounded-lg text-xs bg-white dark:bg-slate-800">
                                                                <option value="">Add produto...</option>
                                                                {availableProducts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                                            </select>
                                                            <button type="button" onClick={() => {
                                                                if (!editSelectedProductId) return;
                                                                const p = availableProducts.find(x => x.id === editSelectedProductId);
                                                                if (!p) return;
                                                                const current = [...(newCard.products_json || [])];
                                                                const existingIdx = current.findIndex(x => x.id === p.id);
                                                                if (existingIdx >= 0) {
                                                                    current[existingIdx] = { ...current[existingIdx], quantity: current[existingIdx].quantity + 1 };
                                                                } else {
                                                                    current.push({ id: p.id, name: p.name, price: p.price, quantity: 1 });
                                                                }
                                                                setNewCard({ ...newCard, products_json: current });
                                                                setEditSelectedProductId("");
                                                            }} className="bg-primary text-white px-2 rounded-lg text-xs">Add</button>
                                                        </div>
                                                        {(newCard.products_json || []).map((op, idx) => (
                                                            <div key={idx} className="flex justify-between items-center text-[10px] p-1 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded mb-1">
                                                                <span>{op.quantity}x {op.name}</span>
                                                                <button type="button" onClick={() => {
                                                                    setNewCard({ ...newCard, products_json: newCard.products_json.filter((_, i) => i !== idx) });
                                                                }} className="text-red-500 material-symbols-outlined text-[12px]">close</button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <button onClick={() => addCard(stage.id)} className="flex-1 py-1.5 bg-primary text-white rounded-lg text-xs font-medium hover:bg-primary-hover">Salvar</button>
                                                        <button onClick={() => setShowNewCard(null)} className="flex-1 py-1.5 border border-border-light dark:border-border-dark rounded-lg text-xs font-medium hover:bg-slate-50">Cancelar</button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <button onClick={() => setShowNewCard(stage.id)} className="w-full py-2.5 border-2 border-dashed border-border-light dark:border-border-dark rounded-lg text-text-secondary-light hover:text-primary hover:border-primary/50 hover:bg-primary/5 transition-all flex items-center justify-center gap-2 group">
                                                    <span className="material-symbols-outlined text-lg group-hover:scale-110 transition-transform">add_circle_outline</span>
                                                    <span className="text-xs font-semibold uppercase tracking-wide">Adicionar</span>
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    )}
                                    </SortableStageShell>
                                );
                            })}

                            {/* New stage inline */}
                            {showNewStage && (
                                <div className="w-[310px] flex flex-col flex-shrink-0 bg-surface-light dark:bg-surface-dark rounded-xl border-2 border-dashed border-primary/40 p-4 space-y-3">
                                    <input autoFocus value={newStageName} onChange={(e) => setNewStageName(e.target.value)}
                                        placeholder="Nome da etapa" className="px-3 py-2 border border-border-light dark:border-border-dark rounded-lg text-sm bg-white dark:bg-slate-800 focus:ring-1 focus:ring-primary focus:border-transparent" />
                                    <label className="flex items-center gap-2 text-xs text-text-secondary-light dark:text-text-secondary-dark">
                                        <input
                                            type="checkbox"
                                            checked={showNewStageAsConversion}
                                            onChange={(e) => setShowNewStageAsConversion(e.target.checked)}
                                            className="rounded border-border-light dark:border-border-dark"
                                        />
                                        Marcar como etapa de conversão
                                    </label>
                                    <div className="flex gap-2">
                                        <button onClick={addStage} className="flex-1 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover">Criar</button>
                                        <button onClick={() => { setShowNewStage(false); setNewStageName(""); setShowNewStageAsConversion(false); }} className="flex-1 py-2 border border-border-light dark:border-border-dark rounded-lg text-sm font-medium hover:bg-slate-50">Cancelar</button>
                                    </div>
                                </div>
                            )}
                        </div>
                        </SortableContext>
                    </div>
                    <DragOverlay>{activeCard ? <CardOverlay card={activeCard} /> : null}</DragOverlay>
                </DndContext>
            ) : (
                /* List View */
                <div className="flex-1 overflow-y-auto p-6">
                    <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark overflow-hidden">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 dark:bg-slate-800/50 text-xs uppercase font-semibold text-text-secondary-light">
                                <tr>
                                    <th className="px-6 py-3">Negócio</th>
                                    <th className="px-6 py-3">Contato</th>
                                    <th className="px-6 py-3">Etapa</th>
                                    <th className="px-6 py-3">Prioridade</th>
                                    <th className="px-6 py-3">Valor</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border-light dark:divide-border-dark">
                                {filteredCards.map((card) => {
                                    const stage = stages.find((s) => s.id === card.stageId);
                                    return (
                                        <tr key={card.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                                            <td className="px-6 py-3 font-medium">{card.name}</td>
                                            <td className="px-6 py-3 text-text-secondary-light">{card.contact}</td>
                                            <td className="px-6 py-3"><span className="bg-primary-light dark:bg-primary/20 text-primary text-xs font-medium px-2 py-0.5 rounded-full">{stage?.title}</span></td>
                                            <td className="px-6 py-3">{card.priority && <span className={`bg-${card.priorityColor}-50 dark:bg-${card.priorityColor}-900/30 text-${card.priorityColor}-600 text-xs font-bold px-2 py-0.5 rounded-md`}>{card.priority}</span>}</td>
                                            <td className="px-6 py-3 font-bold text-green-600">{card.value}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {isMounted && activeMenuCard && editCardMenuPosition && createPortal(
                <div
                    ref={menuRef}
                    className="fixed w-48 bg-surface-light dark:bg-surface-dark rounded-xl shadow-2xl border border-border-light dark:border-border-dark z-[80] py-1"
                    style={{ top: editCardMenuPosition.top, left: editCardMenuPosition.left }}
                >
                    <button onClick={() => { openEditCard(activeMenuCard); setEditCardMenu(null); setEditCardMenuPosition(null); }} className="w-full px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2">
                        <span className="material-symbols-outlined text-base">edit</span> Editar Card
                    </button>
                    <button onClick={() => { openChat(activeMenuCard.id); setEditCardMenu(null); setEditCardMenuPosition(null); }} className="w-full px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2">
                        <span className="material-symbols-outlined text-base">chat</span> Ver Chat
                    </button>
                    <div className="h-px bg-border-light dark:bg-border-dark mx-2 my-1" />
                    <button onClick={() => { setDeleteCardId(activeMenuCard.id); setEditCardMenu(null); setEditCardMenuPosition(null); }} className="w-full px-4 py-2 text-sm hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 flex items-center gap-2">
                        <span className="material-symbols-outlined text-base">delete</span> Excluir
                    </button>
                </div>,
                document.body
            )}

            {/* Report Modal */}
            {showReport && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={() => setShowReport(false)} />
                    <div className="relative bg-surface-light dark:bg-surface-dark rounded-2xl shadow-2xl border border-border-light dark:border-border-dark w-full max-w-xl max-h-[85vh] flex flex-col">
                        <div className="p-6 border-b border-border-light dark:border-border-dark flex justify-between items-center shrink-0">
                            <h3 className="text-lg font-bold font-display">Relatório Mensal</h3>
                            <button onClick={() => setShowReport(false)}><span className="material-symbols-outlined text-text-secondary-light hover:text-text-main-light">close</span></button>
                        </div>
                        <div className="p-6 space-y-6 overflow-y-auto">
                            {isLoadingReport || !reportData ? (
                                <div className="flex justify-center py-8">
                                    <span className="material-symbols-outlined animate-spin text-primary text-3xl">autorenew</span>
                                </div>
                            ) : (
                                <>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl">
                                            <p className="text-xs text-text-secondary-light font-medium uppercase">Total de Conversas</p>
                                            <p className="text-2xl font-bold mt-1">{reportData.totalLeads}</p>
                                        </div>
                                        <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl">
                                            <p className="text-xs text-text-secondary-light font-medium uppercase">Negócios Ativos</p>
                                            <p className="text-2xl font-bold mt-1">{reportData.activeLeads}</p>
                                        </div>
                                        <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl">
                                            <p className="text-xs text-text-secondary-light font-medium uppercase">Valor Total Pipeline</p>
                                            <p className="text-2xl font-bold mt-1 text-green-600">
                                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(reportData.totalValue)}
                                            </p>
                                        </div>
                                        <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl">
                                            <p className="text-xs text-text-secondary-light font-medium uppercase">Taxa de Conversão</p>
                                            <p className="text-2xl font-bold mt-1 text-primary">{reportData.conversionRate}</p>
                                        </div>
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-bold mb-3">Negócios por Etapa</h4>
                                        {reportData.stages.map((s: any) => (
                                            <div key={s.stage} className="flex items-center justify-between py-2 border-b border-border-light/50 dark:border-border-dark last:border-0">
                                                <span className="text-sm">{s.stage}</span>
                                                <div className="flex items-center gap-3">
                                                    <span className="text-xs text-text-secondary-light">{s.count} negócios</span>
                                                    <span className="text-sm font-bold">
                                                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(s.total)}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-bold mb-3">Produtos Mais Vendidos</h4>
                                        <div className="space-y-2">
                                            {reportData.products.length === 0 ? (
                                                <p className="text-xs text-text-secondary-light">Nenhuma venda registrada no período.</p>
                                            ) : (
                                                reportData.products.map((p: any, i: number) => (
                                                    <div key={p.name} className="flex items-center justify-between py-1.5">
                                                        <span className="text-sm">{i + 1}. {p.name}</span>
                                                        <span className="text-xs font-medium text-text-secondary-light">{p.sales} vendas</span>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                        <div className="p-4 border-t border-border-light dark:border-border-dark flex justify-between items-center shrink-0">
                            <button
                                onClick={handleDownloadCSV}
                                disabled={isLoadingReport || !reportData}
                                className="inline-flex items-center px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-hover transition-colors disabled:opacity-50"
                            >
                                <span className="material-symbols-outlined mr-2 text-[18px]">download</span>
                                Exportar CSV
                            </button>
                            <p className="text-xs text-text-secondary-light">© 2026 — Neurix IA</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Card Modal */}
            {editingCard && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={() => { setEditingCard(null); setIsManualValueConfirmed(false); setManualValueJustification(""); }} />
                    <div className="relative bg-surface-light dark:bg-surface-dark rounded-xl shadow-2xl border border-border-light dark:border-border-dark w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
                        <h3 className="text-lg font-bold">Editar Negócio</h3>
                        <div>
                            <label className="block text-xs font-semibold text-text-secondary-light uppercase tracking-wider mb-1">Empresa / Negócio</label>
                            <input value={editingCard.name} onChange={(e) => setEditingCard({ ...editingCard, name: e.target.value })} className="w-full px-3 py-2 border border-border-light dark:border-border-dark rounded-lg text-sm bg-white dark:bg-slate-800 focus:ring-1 focus:ring-primary focus:border-transparent" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-text-secondary-light uppercase tracking-wider mb-1">Contato do WhatsApp</label>
                            <input value={editingCard.contact} onChange={(e) => setEditingCard({ ...editingCard, contact: e.target.value })} className="w-full px-3 py-2 border border-border-light dark:border-border-dark rounded-lg text-sm bg-white dark:bg-slate-800 focus:ring-1 focus:ring-primary focus:border-transparent" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-text-secondary-light uppercase tracking-wider mb-1">Telefone</label>
                            <input value={editingCard.phone || ""} onChange={(e) => setEditingCard({ ...editingCard, phone: formatPhone(e.target.value) })} placeholder="55 41 99999-9999" maxLength={16} className="w-full px-3 py-2 border border-border-light dark:border-border-dark rounded-lg text-sm bg-white dark:bg-slate-800 focus:ring-1 focus:ring-primary focus:border-transparent" />
                        </div>
                        <div className="flex gap-4">
                            <div className="flex-1">
                                <label className="block text-xs font-semibold text-text-secondary-light uppercase tracking-wider mb-1">Valor</label>
                                <input
                                    value={editingCard.value}
                                    onChange={(e) => {
                                        setEditingCard({ ...editingCard, value: e.target.value });
                                        setIsManualValueConfirmed(false);
                                    }}
                                    className="w-full px-3 py-2 border border-border-light dark:border-border-dark rounded-lg text-sm bg-white dark:bg-slate-800 focus:ring-1 focus:ring-primary focus:border-transparent"
                                />
                                <p className="mt-1 text-[11px] text-text-secondary-light dark:text-text-secondary-dark">
                                    Valor com desconto automático: <span className="font-semibold">{editSuggestedValue}</span>
                                </p>
                                {Math.abs(parseCurrency(editingCard.value) - parseCurrency(editSuggestedValue)) > 0.009 && (
                                    <div className="mt-2 space-y-2">
                                        <textarea
                                            value={manualValueJustification}
                                            onChange={(e) => { setManualValueJustification(e.target.value); setIsManualValueConfirmed(false); }}
                                            placeholder="Justifique o ajuste manual de valor"
                                            className="w-full px-3 py-2 border border-amber-300 rounded-lg text-xs bg-amber-50/40 dark:bg-amber-900/10 focus:ring-1 focus:ring-amber-500"
                                            rows={2}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (!manualValueJustification.trim()) {
                                                    alert("Informe a justificativa antes de confirmar o ajuste manual.");
                                                    return;
                                                }
                                                setIsManualValueConfirmed(true);
                                            }}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${isManualValueConfirmed ? "bg-emerald-100 text-emerald-700 border border-emerald-300" : "bg-amber-100 text-amber-700 border border-amber-300 hover:bg-amber-200"}`}
                                        >
                                            {isManualValueConfirmed ? "Ajuste manual confirmado" : "Confirmar ajuste manual"}
                                        </button>
                                    </div>
                                )}
                            </div>
                            <div className="flex-1">
                                <label className="block text-xs font-semibold text-text-secondary-light uppercase tracking-wider mb-1">Prioridade</label>
                                <select value={editingCard.priority || "Média"} onChange={(e) => setEditingCard({ ...editingCard, priority: e.target.value })} className="w-full px-3 py-2 border border-border-light dark:border-border-dark rounded-lg text-sm bg-white dark:bg-slate-800 focus:ring-1 focus:ring-primary focus:border-transparent">
                                    <option>Alta</option><option>Média</option><option>Baixa</option>
                                </select>
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-text-secondary-light uppercase tracking-wider mb-1">Produtos</label>
                            {productFetchError ? (
                                <div className="text-red-500 text-xs mb-2 p-2 bg-red-50 dark:bg-red-900/10 rounded">{productFetchError}</div>
                            ) : null}
                            <div className="flex gap-2 mb-2">
                                <select value={editSelectedProductId} onChange={e => setEditSelectedProductId(e.target.value)} className="flex-1 px-3 py-2 border border-border-light dark:border-border-dark rounded-lg text-sm bg-white dark:bg-slate-800 focus:ring-1 focus:ring-primary">
                                    <option value="">Selecione um produto</option>
                                    {availableProducts.map(p => <option key={p.id} value={p.id}>{p.name} - {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(p.price)}</option>)}
                                </select>
                                <input type="number" min="1" value={editSelectedQuantity} onChange={e => setEditSelectedQuantity(e.target.value ? Number(e.target.value) : "")} className="w-20 px-3 py-2 border border-border-light dark:border-border-dark rounded-lg text-sm bg-white dark:bg-slate-800 focus:ring-1 focus:ring-primary" />
                                <button type="button" onClick={() => {
                                    if (!editSelectedProductId || !editSelectedQuantity || editSelectedQuantity < 1) return;
                                    const p = availableProducts.find(x => x.id === editSelectedProductId);
                                    if (!p) return;

                                    const current = [...(editingCard.products_json || [])];
                                    const existingIdx = current.findIndex(x => x.id === p.id);
                                    if (existingIdx >= 0) {
                                        current[existingIdx] = {
                                            ...current[existingIdx],
                                            quantity: Number(current[existingIdx].quantity ?? current[existingIdx].qty ?? 0) + (Number(editSelectedQuantity) || 1)
                                        };
                                    } else {
                                        current.push({ id: p.id, name: p.name, price: p.price, quantity: (Number(editSelectedQuantity) || 1) });
                                    }
                                    setEditingCard({ ...editingCard, products_json: current });
                                    setIsManualValueConfirmed(false);
                                    setEditSelectedProductId("");
                                    setEditSelectedQuantity(1);
                                }} className="bg-primary text-white px-3 border border-transparent rounded-lg text-sm font-medium hover:bg-primary-hover">Add</button>
                            </div>
                            {(editingCard.products_json || []).length > 0 && (
                                <div className="space-y-1 mb-3">
                                    {(editingCard.products_json || []).map((op, idx) => (
                                        <div key={idx} className="flex justify-between items-center text-sm p-2 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 mx-1 rounded">
                                            <span>{Number(op.quantity ?? op.qty ?? 0)}x {op.name}</span>
                                            <div className="flex items-center gap-2">
                                                <span className="text-[11px] text-purple-600 dark:text-purple-300">
                                                    {op.applied_promotion_name ? op.applied_promotion_name : "Sem promoção"}
                                                </span>
                                                <span>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(op.line_total ?? ((Number(op.quantity ?? op.qty ?? 0)) * Number(op.price || 0))))}</span>
                                                <button type="button" onClick={() => {
                                                    const filtered = editingCard.products_json!.filter((_, i) => i !== idx);
                                                    setEditingCard({ ...editingCard, products_json: filtered });
                                                    setIsManualValueConfirmed(false);
                                                }} className="text-red-500 material-symbols-outlined text-[16px]">close</button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-text-secondary-light uppercase tracking-wider mb-1">Observações</label>
                            <textarea value={editingCard.desc || ""} onChange={(e) => setEditingCard({ ...editingCard, desc: e.target.value })} className="w-full px-3 py-2 border border-border-light dark:border-border-dark rounded-lg text-sm bg-white dark:bg-slate-800 focus:ring-1 focus:ring-primary focus:border-transparent min-h-[80px]" />
                        </div>
                        <div className="flex gap-2 pt-2">
                            <button onClick={handleSaveEditCard} disabled={isSaving} className="flex-1 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                                {isSaving ? "Salvando..." : "Salvar Alterações"}
                            </button>
                            <button onClick={() => { setEditingCard(null); setIsManualValueConfirmed(false); setManualValueJustification(""); }} disabled={isSaving} className="flex-1 py-2 border border-border-light dark:border-border-dark rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* WhatsApp Chat Modal (shared component) */}
            {chatConfig && <WhatsAppChat leadId={chatConfig.leadId} leadName={chatConfig.leadName} onClose={() => setChatConfig(null)} />}

            {/* Delete Confirmation */}
            {
                deleteCardId && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={() => setDeleteCardId(null)} />
                        <div className="relative bg-surface-light dark:bg-surface-dark rounded-xl shadow-2xl border border-border-light dark:border-border-dark w-full max-w-sm p-6 text-center space-y-4">
                            <span className="material-symbols-outlined text-red-500 text-4xl">warning</span>
                            <h3 className="text-lg font-bold">Excluir Lead?</h3>
                            <p className="text-sm text-text-secondary-light dark:text-text-secondary-dark">
                                Esta ação não pode ser desfeita. O lead e suas mensagens serão removidos.
                            </p>
                            <div className="flex gap-2 pt-2">
                                <button onClick={handleDeleteCard} disabled={isDeleting}
                                    className="flex-1 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50">
                                    {isDeleting ? 'Excluindo...' : 'Excluir'}
                                </button>
                                <button onClick={() => setDeleteCardId(null)} disabled={isDeleting}
                                    className="flex-1 py-2 border border-border-light dark:border-border-dark rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors disabled:opacity-50">
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
}
