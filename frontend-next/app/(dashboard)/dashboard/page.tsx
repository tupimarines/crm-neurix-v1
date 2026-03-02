export default function DashboardPage() {
    const stats = [
        { icon: "insights", label: "Taxa de Conversão", value: "24.8%", change: "+12.5%", up: true, bar: "24.8%" },
        { icon: "attach_money", label: "Faturamento Mensal", value: "R$ 48.250", change: "+8.2%", up: true, bar: "75%" },
        { icon: "chat", label: "Volume de Mensagens", value: "1,204", change: "0.0%", up: false, bar: "45%" },
    ];

    const orders = [
        { initials: "JD", color: "orange", name: "João da Silva", company: "Supermercado Silva", product: "Geleia de Morango (Cx 12un)", status: "Pago", statusColor: "green", total: "R$ 450,00" },
        { initials: "MC", color: "blue", name: "Maria Clara", company: "Padaria Central", product: "Geleia de Damasco (Cx 6un)", status: "Pendente", statusColor: "yellow", total: "R$ 180,00" },
        { initials: "EM", color: "purple", name: "Empório Mineiro", company: "Varejo Gourmet", product: "Mix Frutas Vermelhas (Cx 24un)", status: "Pago", statusColor: "green", total: "R$ 890,00" },
        { initials: "CF", color: "pink", name: "Café Flores", company: "Bistrô", product: "Geleia de Pimenta (Cx 6un)", status: "Cancelado", statusColor: "red", total: "R$ 150,00" },
    ];

    return (
        <div className="p-6 lg:p-10 max-w-7xl mx-auto space-y-8">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-display font-bold">Painel de Controle</h1>
                    <p className="text-text-secondary-light dark:text-text-secondary-dark mt-1">
                        Bem-vindo de volta! Aqui está o resumo da sua produção de geleias.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <input
                            className="pl-10 pr-4 py-2 rounded-xl border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark text-sm focus:ring-primary focus:border-primary w-full sm:w-64 shadow-sm"
                            placeholder="Buscar pedidos..."
                            type="text"
                        />
                        <span className="material-symbols-outlined absolute left-3 top-2.5 text-text-secondary-light text-lg">
                            search
                        </span>
                    </div>
                    <button className="bg-primary hover:bg-primary-hover text-white px-4 py-2 rounded-xl shadow-lg shadow-primary/30 flex items-center gap-2 transition-all text-sm font-medium">
                        <span className="material-symbols-outlined text-sm">add</span>
                        Novo Pedido
                    </button>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {stats.map((stat) => (
                    <div
                        key={stat.label}
                        className="bg-surface-light dark:bg-surface-dark p-6 rounded-2xl shadow-sm border border-border-light/50 dark:border-border-dark relative overflow-hidden group"
                    >
                        <div className="absolute right-0 top-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                            <span className="material-symbols-outlined text-8xl text-primary">
                                trending_up
                            </span>
                        </div>
                        <div className="flex items-center justify-between mb-4">
                            <div className="p-2 bg-primary-light dark:bg-primary/10 rounded-lg text-primary">
                                <span className="material-symbols-outlined text-xl">
                                    {stat.icon}
                                </span>
                            </div>
                            <span
                                className={`${stat.up
                                        ? "text-green-500 bg-green-50 dark:bg-green-500/10"
                                        : "text-slate-400 bg-slate-50 dark:bg-slate-700/30"
                                    } px-2 py-1 rounded text-xs font-semibold flex items-center gap-1`}
                            >
                                {stat.change}
                                <span className="material-symbols-outlined text-xs">
                                    {stat.up ? "arrow_upward" : "remove"}
                                </span>
                            </span>
                        </div>
                        <h3 className="text-text-secondary-light dark:text-text-secondary-dark text-sm font-medium uppercase tracking-wide">
                            {stat.label}
                        </h3>
                        <p className="text-3xl font-display font-bold mt-1">{stat.value}</p>
                        <div className="mt-4 h-1.5 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-primary rounded-full"
                                style={{ width: stat.bar }}
                            />
                        </div>
                    </div>
                ))}
            </div>

            {/* Orders Table */}
            <div className="bg-surface-light dark:bg-surface-dark rounded-2xl shadow-sm border border-border-light dark:border-border-dark overflow-hidden">
                <div className="p-6 border-b border-border-light dark:border-border-dark flex items-center justify-between">
                    <h2 className="text-lg font-display font-semibold">Últimos Pedidos</h2>
                    <button className="text-sm text-primary font-medium hover:text-primary-hover flex items-center gap-1">
                        Ver todos
                        <span className="material-symbols-outlined text-sm">
                            arrow_forward
                        </span>
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
                                <tr
                                    key={i}
                                    className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors group"
                                >
                                    <td className="px-6 py-4 font-medium flex items-center gap-3">
                                        <div
                                            className={`h-8 w-8 rounded-full bg-${order.color}-100 dark:bg-${order.color}-900/30 text-${order.color}-600 dark:text-${order.color}-400 flex items-center justify-center text-xs font-bold`}
                                        >
                                            {order.initials}
                                        </div>
                                        <div>
                                            <p>{order.name}</p>
                                            <p className="text-xs text-text-secondary-light dark:text-text-secondary-dark font-normal">
                                                {order.company}
                                            </p>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-text-secondary-light dark:text-text-secondary-dark">
                                        {order.product}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span
                                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-${order.statusColor}-100 text-${order.statusColor}-700 dark:bg-${order.statusColor}-500/20 dark:text-${order.statusColor}-400`}
                                        >
                                            <span
                                                className={`w-1.5 h-1.5 rounded-full bg-${order.statusColor}-500`}
                                            />
                                            {order.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 font-medium">{order.total}</td>
                                    <td className="px-6 py-4 text-right">
                                        <button className="text-green-600 hover:text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-500/10 p-2 rounded-lg transition-colors">
                                            <span className="material-symbols-outlined text-lg">
                                                chat
                                            </span>
                                        </button>
                                        <button className="text-text-secondary-light hover:text-primary dark:text-text-secondary-dark p-2 ml-1">
                                            <span className="material-symbols-outlined text-lg">
                                                more_vert
                                            </span>
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Footer */}
            <div className="mt-8 pt-6 border-t border-border-light dark:border-border-dark flex justify-between items-center text-xs text-text-secondary-light dark:text-text-secondary-dark">
                <p>© 2024 Neurix Systems. Feito para Fábricas Modernas.</p>
                <div className="flex gap-4">
                    <a className="hover:text-primary" href="#">Suporte</a>
                    <a className="hover:text-primary" href="#">Termos</a>
                </div>
            </div>
        </div>
    );
}
