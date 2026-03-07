"use client";

import { useState, useRef, useEffect, useId } from "react";
import {
    DndContext,
    closestCenter,
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
    arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { api } from "@/lib/api";
import WhatsAppChat from "@/components/WhatsAppChat";

// Types
interface KanbanCard {
    id: string;
    name: string;
    contact: string;
    value: string;
    priority: string;
    priorityColor: string;
    desc: string;
    stageId: string;
}

interface KanbanStage {
    id: string;
    title: string;
}

// Sortable Card Component
function SortableCard({ card, onOpenChat, onOpenMenu }: { card: KanbanCard; onOpenChat: (id: string) => void; onOpenMenu: (id: string) => void }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });
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
                    <button onClick={(e) => { e.stopPropagation(); onOpenMenu(card.id); }} className="text-text-secondary-light hover:text-primary transition-colors p-1 rounded" title="Opções">
                        <span className="material-symbols-outlined text-lg">more_vert</span>
                    </button>
                </div>
            </div>
        </div>
    );
}

// Card overlay for dragging
function CardOverlay({ card }: { card: KanbanCard }) {
    return (
        <div data-kanban-card="true" className="bg-surface-light dark:bg-surface-dark p-4 rounded-lg shadow-2xl border-2 border-primary/40 w-[300px] rotate-2">
            <h3 className="text-sm font-bold">{card.name}</h3>
            <p className="text-xs text-text-secondary-light mt-1">Contato: {card.contact}</p>
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

// Stage slug to stageId mapping
const STAGE_MAP: Record<string, string> = {
    contato_inicial: "s1",
    escolhendo_sabores: "s2",
    aguardando_pagamento: "s3",
    enviado: "s4",
};
const STAGE_ID_TO_SLUG: Record<string, string> = {
    s1: "contato_inicial",
    s2: "escolhendo_sabores",
    s3: "aguardando_pagamento",
    s4: "enviado",
};

const PRIORITY_MAP: Record<string, { label: string; color: string }> = {
    alta: { label: "Alta", color: "red" },
    media: { label: "Média", color: "blue" },
    baixa: { label: "Baixa", color: "yellow" },
};

export default function KanbanPage() {
    const dndId = useId();

    // State
    const [isMounted, setIsMounted] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [stages, setStages] = useState<KanbanStage[]>([
        { id: "s1", title: "Contato Inicial" },
        { id: "s2", title: "Escolhendo Sabores" },
        { id: "s3", title: "Aguardando Pagamento" },
        { id: "s4", title: "Enviado" },
    ]);
    const [cards, setCards] = useState<KanbanCard[]>([]);

    // Fetch real leads from API on mount
    useEffect(() => {
        setIsMounted(true);
        async function fetchKanban() {
            setIsLoading(true);
            try {
                const token = localStorage.getItem("access_token") || undefined;
                const data = await api<{
                    columns: Array<{
                        stage: string;
                        label: string;
                        leads: Array<{
                            id: string;
                            company_name: string;
                            contact_name: string;
                            value: number;
                            priority: string | null;
                            notes: string | null;
                            stage: string;
                            whatsapp_chat_id: string | null;
                        }>;
                    }>
                }>("/api/leads/kanban", { method: "GET", token });

                const allCards: KanbanCard[] = [];
                for (const col of data.columns) {
                    const stageId = STAGE_MAP[col.stage] || col.stage;
                    for (const lead of col.leads) {
                        const pri = lead.priority ? PRIORITY_MAP[lead.priority] : null;
                        allCards.push({
                            id: lead.id,
                            stageId,
                            name: lead.company_name,
                            contact: lead.contact_name,
                            value: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(lead.value || 0),
                            priority: pri?.label || "",
                            priorityColor: pri?.color || "",
                            desc: lead.notes || "",
                        });
                    }
                }
                setCards(allCards);
            } catch (err) {
                console.error("Failed to fetch kanban data:", err);
            } finally {
                setIsLoading(false);
            }
        }
        fetchKanban();
    }, []);

    // Removed localStorage sync — data now comes from API


    const [viewMode, setViewMode] = useState<"kanban" | "list">("kanban");
    const [activeCard, setActiveCard] = useState<KanbanCard | null>(null);
    const [showNewStage, setShowNewStage] = useState(false);
    const [newStageName, setNewStageName] = useState("");
    const [showNewCard, setShowNewCard] = useState<string | null>(null);
    const [newCard, setNewCard] = useState({ name: "", contact: "", value: "", priority: "Média" });
    const [showFilter, setShowFilter] = useState(false);
    const [filterPriority, setFilterPriority] = useState("");
    const [filterSort, setFilterSort] = useState("");
    const [showSearch, setShowSearch] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [showReport, setShowReport] = useState(false);
    const [showAddMenu, setShowAddMenu] = useState(false);
    const [editCardMenu, setEditCardMenu] = useState<string | null>(null);
    const [editingCard, setEditingCard] = useState<KanbanCard | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [editStage, setEditStage] = useState<string | null>(null);
    const [editStageName, setEditStageName] = useState("");
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

    const parseCurrency = (val: string) => {
        if (!val) return 0;
        const cleanObj = val.replace(/[^\d,-]/g, '').replace(',', '.');
        return parseFloat(cleanObj) || 0;
    };

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
    };

    // DnD handlers
    function handleDragStart(event: DragStartEvent) {
        const card = cards.find((c) => c.id === event.active.id);
        if (card) setActiveCard(card);
    }

    function handleDragOver(event: DragOverEvent) {
        const { active, over } = event;
        if (!over) return;
        const activeCardId = active.id as string;
        const overId = over.id as string;
        const activeCardObj = cards.find((c) => c.id === activeCardId);
        if (!activeCardObj) return;

        // Dropping over a stage directly
        const targetStage = stages.find((s) => s.id === overId);
        if (targetStage && activeCardObj.stageId !== overId) {
            setCards((prev) => prev.map((c) => c.id === activeCardId ? { ...c, stageId: overId } : c));
            return;
        }

        // Dropping over another card
        const overCard = cards.find((c) => c.id === overId);
        if (overCard && activeCardObj.stageId !== overCard.stageId) {
            setCards((prev) => prev.map((c) => c.id === activeCardId ? { ...c, stageId: overCard.stageId } : c));
        }
    }

    function handleDragEnd(event: DragEndEvent) {
        setActiveCard(null);
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        const activeCardObj = cards.find((c) => c.id === active.id);
        const overCardObj = cards.find((c) => c.id === over.id);
        if (activeCardObj && overCardObj && activeCardObj.stageId === overCardObj.stageId) {
            const stageCards = cards.filter((c) => c.stageId === activeCardObj.stageId);
            const oldIdx = stageCards.findIndex((c) => c.id === active.id);
            const newIdx = stageCards.findIndex((c) => c.id === over.id);
            const reordered = arrayMove(stageCards, oldIdx, newIdx);
            setCards((prev) => {
                const others = prev.filter((c) => c.stageId !== activeCardObj.stageId);
                return [...others, ...reordered];
            });
        }

        // Sync stage change with backend
        if (activeCardObj) {
            const newStageSlug = STAGE_ID_TO_SLUG[activeCardObj.stageId];
            if (newStageSlug) {
                const token = localStorage.getItem("access_token") || undefined;
                api(`/api/leads/${activeCardObj.id}/stage`, {
                    method: 'PATCH',
                    body: JSON.stringify({ stage: newStageSlug }),
                    token
                }).catch(err => console.warn("Failed to sync stage move:", err));
            }
        }
    }

    // Actions
    function addStage() {
        if (!newStageName.trim()) return;
        const id = `s${crypto.randomUUID()}`;
        setStages([...stages, { id, title: newStageName.trim() }]);
        setNewStageName("");
        setShowNewStage(false);
    }

    async function addCard(stageId: string) {
        if (!newCard.name.trim()) return;
        const token = localStorage.getItem("access_token") || undefined;
        const stageSlug = STAGE_ID_TO_SLUG[stageId] || "contato_inicial";
        const priorityApiMap: Record<string, string> = { Alta: "alta", Média: "media", Baixa: "baixa" };
        const priorityColorMap: Record<string, string> = { Alta: "red", Média: "blue", Baixa: "yellow", OK: "green" };

        try {
            const created = await api<{ id: string; company_name: string; contact_name: string; value: number; priority: string | null; notes: string | null }>("/api/leads", {
                method: "POST",
                body: JSON.stringify({
                    company_name: newCard.name,
                    contact_name: newCard.contact || newCard.name,
                    stage: stageSlug,
                    value: parseCurrency(newCard.value),
                    priority: priorityApiMap[newCard.priority] || null,
                }),
                token
            });

            setCards([...cards, {
                id: created.id, stageId, name: newCard.name, contact: newCard.contact || newCard.name,
                value: newCard.value || "R$ 0,00", priority: newCard.priority,
                priorityColor: priorityColorMap[newCard.priority] || "blue", desc: "",
            }]);
        } catch (err) {
            console.error("Failed to create lead:", err);
            // Fallback: add locally anyway
            const id = `c${crypto.randomUUID()}`;
            setCards([...cards, {
                id, stageId, name: newCard.name, contact: newCard.contact,
                value: newCard.value || "R$ 0,00", priority: newCard.priority,
                priorityColor: priorityColorMap[newCard.priority] || "blue", desc: "",
            }]);
        }
        setNewCard({ name: "", contact: "", value: "", priority: "Média" });
        setShowNewCard(null);
    }

    function renameStage(stageId: string) {
        if (!editStageName.trim()) return;
        setStages(stages.map((s) => s.id === stageId ? { ...s, title: editStageName.trim() } : s));
        setEditStage(null);
        setEditStageName("");
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
                priority: priorityMap[editingCard.priority],
                value: parseCurrency(editingCard.value),
                notes: editingCard.desc,
            };

            // Call the PATCH endpoint to sync with Uazapi
            try {
                // Ignore any 400 errors if it's a mocked local card "c1" "c2" that isn't in DB yet
                await api(`/api/leads/${editingCard.id}`, {
                    method: 'PATCH',
                    body: JSON.stringify(payload),
                    token
                });
            } catch (err) {
                console.warn("API update failed, could be mocked card:", err);
            }

            // Sync color logic
            const priorityColorMap: Record<string, string> = { Alta: "red", Média: "blue", Baixa: "yellow", OK: "green" };
            const updatedCard = { ...editingCard, priorityColor: priorityColorMap[editingCard.priority] || "gray" };

            setCards(cards.map(c => c.id === updatedCard.id ? updatedCard : c));
            setEditingCard(null);
        } catch (error) {
            console.error("Failed to save edited card:", error);
            // Even if failed, update local UI for demo purposes
            const priorityColorMap: Record<string, string> = { Alta: "red", Média: "blue", Baixa: "yellow", OK: "green" };
            const updatedCard = { ...editingCard, priorityColor: priorityColorMap[editingCard.priority] || "gray" };
            setCards(cards.map(c => c.id === updatedCard.id ? updatedCard : c));
            setEditingCard(null);
        } finally {
            setIsSaving(false);
        }
    }

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
                    <button onClick={() => setShowReport(true)} className="flex items-center text-sm font-medium text-text-secondary-light hover:text-primary transition-colors">
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
                                <button onClick={() => { setShowNewStage(true); setShowAddMenu(false); }}
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
                <DndContext id={dndId} sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
                    <div
                        className="flex-1 overflow-x-auto overflow-y-hidden p-6 cursor-grab active:cursor-grabbing"
                        ref={boardRef}
                        onMouseDown={onMouseDown}
                        onMouseMove={onMouseMove}
                        onMouseUp={onMouseUp}
                        onMouseLeave={onMouseUp}
                    >
                        <div className="flex h-full gap-5 min-w-max pb-4">
                            {stages.map((stage) => {
                                const stageCards = filteredCards.filter((c) => c.stageId === stage.id);
                                return (
                                    <div key={stage.id} className="w-[310px] flex flex-col flex-shrink-0 bg-slate-50/50 dark:bg-slate-800/30 rounded-xl border border-border-light/60 dark:border-border-dark/60">
                                        {/* Stage header */}
                                        <div className="p-3 flex items-center justify-between border-b border-border-light/50 dark:border-border-dark/50">
                                            <div className="flex items-center gap-2 flex-1 min-w-0">
                                                {editStage === stage.id ? (
                                                    <form onSubmit={(e) => { e.preventDefault(); renameStage(stage.id); }} className="flex items-center gap-1 flex-1">
                                                        <input autoFocus value={editStageName} onChange={(e) => setEditStageName(e.target.value)}
                                                            className="text-sm font-semibold border border-primary rounded-lg px-2 py-1 bg-white dark:bg-surface-dark flex-1 focus:outline-none focus:ring-1 focus:ring-primary"
                                                            onBlur={() => renameStage(stage.id)} />
                                                    </form>
                                                ) : (
                                                    <button onClick={() => { setEditStage(stage.id); setEditStageName(stage.title); }} className="text-sm font-semibold truncate hover:text-primary transition-colors">
                                                        {stage.title}
                                                    </button>
                                                )}
                                                <span className="bg-primary-light dark:bg-primary/20 text-primary text-xs font-medium px-2 py-0.5 rounded-full shrink-0">
                                                    {stageCards.length}
                                                </span>
                                            </div>
                                            <div className="flex items-center text-xs text-text-secondary-light shrink-0 ml-2">
                                                {formatCurrency(stageCards.reduce((acc, c) => acc + parseCurrency(c.value), 0))}
                                                <button onClick={() => { setShowNewStage(true); }} className="ml-1 p-0.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full text-primary" title="Nova etapa">
                                                    <span className="material-symbols-outlined text-lg">add</span>
                                                </button>
                                            </div>
                                        </div>
                                        {/* Cards */}
                                        <SortableContext items={stageCards.map((c) => c.id)} strategy={verticalListSortingStrategy} id={stage.id}>
                                            <DroppableStage id={stage.id} className="flex-1 p-3 overflow-y-auto space-y-2.5 custom-scrollbar min-h-[100px]">
                                                {stageCards.map((card) => (
                                                    <div key={card.id} className="relative">
                                                        <SortableCard card={card} onOpenChat={(id) => openChat(id)} onOpenMenu={(id) => setEditCardMenu(editCardMenu === id ? null : id)} />
                                                        {editCardMenu === card.id && (
                                                            <div ref={menuRef} className="absolute right-0 top-full mt-1 w-48 bg-surface-light dark:bg-surface-dark rounded-xl shadow-2xl border border-border-light dark:border-border-dark z-50 py-1">
                                                                <button onClick={() => { setEditingCard(card); setEditCardMenu(null); }} className="w-full px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2">
                                                                    <span className="material-symbols-outlined text-base">edit</span> Editar Card
                                                                </button>
                                                                <button onClick={() => { openChat(card.id); setEditCardMenu(null); }} className="w-full px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2">
                                                                    <span className="material-symbols-outlined text-base">chat</span> Ver Chat
                                                                </button>
                                                                <div className="h-px bg-border-light dark:bg-border-dark mx-2 my-1" />
                                                                <button onClick={() => { setDeleteCardId(card.id); setEditCardMenu(null); }} className="w-full px-4 py-2 text-sm hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 flex items-center gap-2">
                                                                    <span className="material-symbols-outlined text-base">delete</span> Excluir
                                                                </button>
                                                            </div>
                                                        )}
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
                                                    <div className="flex gap-2">
                                                        <input value={newCard.value} onChange={(e) => setNewCard({ ...newCard, value: e.target.value })} placeholder="R$ 0,00" className="flex-1 px-3 py-1.5 border border-border-light dark:border-border-dark rounded-lg text-sm bg-white dark:bg-slate-800 focus:ring-1 focus:ring-primary focus:border-transparent" />
                                                        <select value={newCard.priority} onChange={(e) => setNewCard({ ...newCard, priority: e.target.value })} className="px-2 py-1.5 border border-border-light dark:border-border-dark rounded-lg text-sm bg-white dark:bg-slate-800">
                                                            <option>Alta</option><option>Média</option><option>Baixa</option>
                                                        </select>
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
                                );
                            })}

                            {/* New stage inline */}
                            {showNewStage && (
                                <div className="w-[310px] flex flex-col flex-shrink-0 bg-surface-light dark:bg-surface-dark rounded-xl border-2 border-dashed border-primary/40 p-4 space-y-3">
                                    <input autoFocus value={newStageName} onChange={(e) => setNewStageName(e.target.value)}
                                        placeholder="Nome da etapa" className="px-3 py-2 border border-border-light dark:border-border-dark rounded-lg text-sm bg-white dark:bg-slate-800 focus:ring-1 focus:ring-primary focus:border-transparent" />
                                    <div className="flex gap-2">
                                        <button onClick={addStage} className="flex-1 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover">Criar</button>
                                        <button onClick={() => { setShowNewStage(false); setNewStageName(""); }} className="flex-1 py-2 border border-border-light dark:border-border-dark rounded-lg text-sm font-medium hover:bg-slate-50">Cancelar</button>
                                    </div>
                                </div>
                            )}
                        </div>
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

            {/* Report Modal */}
            {showReport && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={() => setShowReport(false)} />
                    <div className="relative bg-surface-light dark:bg-surface-dark rounded-2xl shadow-2xl border border-border-light dark:border-border-dark w-full max-w-xl max-h-[85vh] overflow-y-auto">
                        <div className="p-6 border-b border-border-light dark:border-border-dark flex justify-between">
                            <h3 className="text-lg font-bold font-display">Relatório Mensal</h3>
                            <button onClick={() => setShowReport(false)}><span className="material-symbols-outlined text-text-secondary-light hover:text-text-main-light">close</span></button>
                        </div>
                        <div className="p-6 space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl">
                                    <p className="text-xs text-text-secondary-light font-medium uppercase">Total de Conversas</p>
                                    <p className="text-2xl font-bold mt-1">127</p>
                                </div>
                                <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl">
                                    <p className="text-xs text-text-secondary-light font-medium uppercase">Negócios Ativos</p>
                                    <p className="text-2xl font-bold mt-1">{cards.length}</p>
                                </div>
                                <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl">
                                    <p className="text-xs text-text-secondary-light font-medium uppercase">Valor Total Pipeline</p>
                                    <p className="text-2xl font-bold mt-1 text-green-600">R$ 13.850</p>
                                </div>
                                <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl">
                                    <p className="text-xs text-text-secondary-light font-medium uppercase">Taxa de Conversão</p>
                                    <p className="text-2xl font-bold mt-1 text-primary">24.8%</p>
                                </div>
                            </div>
                            <div>
                                <h4 className="text-sm font-bold mb-3">Negócios por Etapa</h4>
                                {stages.map((s) => {
                                    const stageCardsInfo = cards.filter((c) => c.stageId === s.id);
                                    const count = stageCardsInfo.length;
                                    const computedTotal = formatCurrency(stageCardsInfo.reduce((acc, c) => acc + parseCurrency(c.value), 0));
                                    return (
                                        <div key={s.id} className="flex items-center justify-between py-2 border-b border-border-light/50 dark:border-border-dark last:border-0">
                                            <span className="text-sm">{s.title}</span>
                                            <div className="flex items-center gap-3">
                                                <span className="text-xs text-text-secondary-light">{count} negócios</span>
                                                <span className="text-sm font-bold">{computedTotal}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            <div>
                                <h4 className="text-sm font-bold mb-3">Produtos Mais Vendidos</h4>
                                <div className="space-y-2">
                                    {["Geleia de Morango", "Mix Frutas Vermelhas", "Geleia de Damasco"].map((p, i) => (
                                        <div key={p} className="flex items-center justify-between py-1.5">
                                            <span className="text-sm">{i + 1}. {p}</span>
                                            <span className="text-xs font-medium text-text-secondary-light">{[42, 28, 15][i]} vendas</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="p-4 border-t border-border-light dark:border-border-dark text-center">
                            <p className="text-xs text-text-secondary-light">© 2026 — Neurix IA</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Card Modal */}
            {editingCard && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={() => setEditingCard(null)} />
                    <div className="relative bg-surface-light dark:bg-surface-dark rounded-xl shadow-2xl border border-border-light dark:border-border-dark w-full max-w-md p-6 space-y-4">
                        <h3 className="text-lg font-bold">Editar Negócio</h3>
                        <div>
                            <label className="block text-xs font-semibold text-text-secondary-light uppercase tracking-wider mb-1">Empresa / Negócio</label>
                            <input value={editingCard.name} onChange={(e) => setEditingCard({ ...editingCard, name: e.target.value })} className="w-full px-3 py-2 border border-border-light dark:border-border-dark rounded-lg text-sm bg-white dark:bg-slate-800 focus:ring-1 focus:ring-primary focus:border-transparent" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-text-secondary-light uppercase tracking-wider mb-1">Contato do WhatsApp</label>
                            <input value={editingCard.contact} onChange={(e) => setEditingCard({ ...editingCard, contact: e.target.value })} className="w-full px-3 py-2 border border-border-light dark:border-border-dark rounded-lg text-sm bg-white dark:bg-slate-800 focus:ring-1 focus:ring-primary focus:border-transparent" />
                        </div>
                        <div className="flex gap-4">
                            <div className="flex-1">
                                <label className="block text-xs font-semibold text-text-secondary-light uppercase tracking-wider mb-1">Valor</label>
                                <input value={editingCard.value} onChange={(e) => setEditingCard({ ...editingCard, value: e.target.value })} className="w-full px-3 py-2 border border-border-light dark:border-border-dark rounded-lg text-sm bg-white dark:bg-slate-800 focus:ring-1 focus:ring-primary focus:border-transparent" />
                            </div>
                            <div className="flex-1">
                                <label className="block text-xs font-semibold text-text-secondary-light uppercase tracking-wider mb-1">Prioridade</label>
                                <select value={editingCard.priority || "Média"} onChange={(e) => setEditingCard({ ...editingCard, priority: e.target.value })} className="w-full px-3 py-2 border border-border-light dark:border-border-dark rounded-lg text-sm bg-white dark:bg-slate-800 focus:ring-1 focus:ring-primary focus:border-transparent">
                                    <option>Alta</option><option>Média</option><option>Baixa</option>
                                </select>
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-text-secondary-light uppercase tracking-wider mb-1">Observações</label>
                            <textarea value={editingCard.desc || ""} onChange={(e) => setEditingCard({ ...editingCard, desc: e.target.value })} className="w-full px-3 py-2 border border-border-light dark:border-border-dark rounded-lg text-sm bg-white dark:bg-slate-800 focus:ring-1 focus:ring-primary focus:border-transparent min-h-[80px]" />
                        </div>
                        <div className="flex gap-2 pt-2">
                            <button onClick={handleSaveEditCard} disabled={isSaving} className="flex-1 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                                {isSaving ? "Salvando..." : "Salvar Alterações"}
                            </button>
                            <button onClick={() => setEditingCard(null)} disabled={isSaving} className="flex-1 py-2 border border-border-light dark:border-border-dark rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* WhatsApp Chat Modal (shared component) */}
            {chatConfig && <WhatsAppChat leadId={chatConfig.leadId} leadName={chatConfig.leadName} onClose={() => setChatConfig(null)} />}

            {/* Delete Confirmation */}
            {deleteCardId && (
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
            )}
        </div>
    );
}
