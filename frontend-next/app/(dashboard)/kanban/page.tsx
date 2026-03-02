export default function KanbanPage() {
    const columns = [
        {
            title: "Contato Inicial",
            total: "R$ 3.450,00",
            cards: [
                { name: "Empório Natural", contact: "Ana Silva", value: "R$ 1.200,00", priority: "Alta", priorityColor: "red", desc: "Interesse em geleias de morango e frutas vermelhas." },
                { name: "Mercado Verde", contact: "Carlos", value: "R$ 850,00", priority: "Média", priorityColor: "blue", desc: "" },
                { name: "Padaria Central", contact: "Roberta", value: "R$ 1.400,00", priority: "", priorityColor: "", desc: "" },
            ],
        },
        {
            title: "Escolhendo Sabores",
            total: "R$ 5.100,00",
            cards: [
                { name: "Rede Sabor", contact: "Marcos", value: "R$ 2.500,00", priority: "Baixa", priorityColor: "yellow", desc: "Solicitou amostras de pimenta e damasco." },
                { name: "Café Colonial", contact: "Juliana", value: "R$ 2.600,00", priority: "Alta", priorityColor: "red", desc: "" },
            ],
        },
        {
            title: "Aguardando Pagamento",
            total: "R$ 4.200,00",
            cards: [
                { name: "Boutique Gourmet", contact: "Fernanda", value: "R$ 4.200,00", priority: "Alta", priorityColor: "red", desc: "Pedido #4092 - PIX pendente." },
            ],
        },
        {
            title: "Enviado",
            total: "R$ 1.100,00",
            cards: [
                { name: "Loja Orgânica", contact: "Pedro", value: "R$ 1.100,00", priority: "OK", priorityColor: "green", desc: "" },
            ],
        },
    ];

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <header className="bg-surface-light dark:bg-surface-dark border-b border-border-light dark:border-border-dark h-16 flex items-center justify-between px-6 flex-shrink-0 z-10">
                <div className="flex items-center gap-4">
                    <button className="inline-flex items-center px-3 py-1.5 border border-border-light dark:border-border-dark shadow-sm text-sm font-medium rounded-lg text-text-main-light dark:text-text-main-dark bg-surface-light dark:bg-surface-dark hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                        <span className="material-symbols-outlined text-base mr-1.5 text-text-secondary-light">filter_list</span>
                        Filtro
                    </button>
                    <button className="inline-flex items-center px-3 py-1.5 border border-border-light dark:border-border-dark shadow-sm text-sm font-medium rounded-lg text-text-main-light dark:text-text-main-dark bg-surface-light dark:bg-surface-dark hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                        Buscar
                    </button>
                </div>
                <div className="flex items-center gap-4">
                    <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5 border border-border-light dark:border-border-dark">
                        <button className="p-1.5 rounded-md bg-white dark:bg-slate-600 shadow-sm text-primary dark:text-white">
                            <span className="material-symbols-outlined text-xl">view_kanban</span>
                        </button>
                        <button className="p-1.5 rounded-md text-text-secondary-light dark:text-text-secondary-dark hover:text-text-main-light">
                            <span className="material-symbols-outlined text-xl">format_list_bulleted</span>
                        </button>
                    </div>
                    <button className="flex items-center text-sm font-medium text-text-secondary-light dark:text-text-secondary-dark hover:text-primary transition-colors">
                        <span className="material-symbols-outlined mr-1.5 text-lg">trending_up</span>
                        Relatório
                    </button>
                    <button className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg shadow-sm text-white bg-primary hover:bg-primary-hover transition-colors">
                        <span className="material-symbols-outlined mr-1.5 text-lg">add</span>
                        Adicionar
                    </button>
                </div>
            </header>

            {/* Kanban Board */}
            <div className="flex-1 overflow-x-auto overflow-y-hidden p-6">
                <div className="flex h-full gap-6 min-w-max pb-4">
                    {columns.map((col) => (
                        <div
                            key={col.title}
                            className="w-80 flex flex-col flex-shrink-0 bg-slate-50/50 dark:bg-slate-800/30 rounded-xl border border-border-light/60 dark:border-border-dark/60"
                        >
                            {/* Column Header */}
                            <div className="p-3 flex items-center justify-between border-b border-border-light/50 dark:border-border-dark/50">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-semibold">{col.title}</span>
                                    <span className="bg-primary-light dark:bg-primary/20 text-primary text-xs font-medium px-2 py-0.5 rounded-full">
                                        {col.cards.length}
                                    </span>
                                </div>
                                <div className="flex items-center text-xs text-text-secondary-light dark:text-text-secondary-dark">
                                    {col.total}
                                    <button className="ml-2 p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors text-primary">
                                        <span className="material-symbols-outlined text-lg">add</span>
                                    </button>
                                </div>
                            </div>

                            {/* Cards */}
                            <div className="flex-1 p-3 overflow-y-auto space-y-3 custom-scrollbar">
                                {col.cards.map((card, i) => (
                                    <div
                                        key={i}
                                        className="bg-surface-light dark:bg-surface-dark p-4 rounded-lg shadow-sm border border-border-light dark:border-border-dark hover:shadow-md hover:border-primary/30 transition-all cursor-grab active:cursor-grabbing"
                                    >
                                        <div className="flex justify-between items-start mb-3">
                                            <div>
                                                <h3 className="text-sm font-bold">{card.name}</h3>
                                                <p className="text-xs text-text-secondary-light dark:text-text-secondary-dark mt-1">
                                                    Contato: {card.contact}
                                                </p>
                                            </div>
                                            {card.priority && (
                                                <span
                                                    className={`bg-${card.priorityColor}-50 dark:bg-${card.priorityColor}-900/30 text-${card.priorityColor}-600 dark:text-${card.priorityColor}-300 text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wider`}
                                                >
                                                    {card.priority}
                                                </span>
                                            )}
                                        </div>
                                        {card.desc && (
                                            <p className="text-xs text-text-secondary-light dark:text-text-secondary-dark mb-3 line-clamp-2">
                                                {card.desc}
                                            </p>
                                        )}
                                        <div className="flex items-center justify-between mt-4 pt-3 border-t border-border-light/30 dark:border-border-dark">
                                            <span className="text-sm font-bold text-green-600 dark:text-green-400">
                                                {card.value}
                                            </span>
                                            <button className="text-text-secondary-light hover:text-green-500 transition-colors" title="WhatsApp">
                                                <span className="material-symbols-outlined text-lg">chat</span>
                                            </button>
                                        </div>
                                    </div>
                                ))}

                                {/* Add card button */}
                                <button className="w-full py-3 border-2 border-dashed border-border-light dark:border-border-dark rounded-lg text-text-secondary-light hover:text-primary hover:border-primary/50 hover:bg-primary/5 transition-all flex items-center justify-center gap-2 group">
                                    <span className="material-symbols-outlined text-xl group-hover:scale-110 transition-transform">
                                        add_circle_outline
                                    </span>
                                    <span className="text-xs font-semibold uppercase tracking-wide">
                                        Adicionar
                                    </span>
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
