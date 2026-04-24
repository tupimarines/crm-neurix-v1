/**
 * Neurix CRM — Dashboard Logic
 * Fetches KPIs and recent orders from the API, updates the DOM.
 */

const Dashboard = {
    async init() {
        if (!Auth.requireAuth()) return;
        await Promise.all([
            this.loadKPIs(),
            this.loadRecentOrders(),
        ]);
    },

    async loadKPIs() {
        try {
            const res = await Auth.apiRequest('/dashboard/kpis');
            if (!res.ok) throw new Error('Erro ao carregar KPIs');
            const data = await res.json();

            this._updateKPI('kpi-conversion', `${data.conversion_rate}%`, data.conversion_change);
            this._updateKPI('kpi-revenue', App.formatCurrency(data.monthly_revenue), data.revenue_change);
            const contacts = typeof data.new_contacts === 'number' ? data.new_contacts : data.message_volume;
            const contactsCh = typeof data.new_contacts_change === 'number' ? data.new_contacts_change : data.message_change;
            this._updateKPI('kpi-messages', contacts.toLocaleString('pt-BR'), contactsCh);
        } catch (err) {
            console.error('KPI load error:', err);
        }
    },

    async loadRecentOrders() {
        try {
            const res = await Auth.apiRequest('/dashboard/recent-orders');
            if (!res.ok) throw new Error('Erro ao carregar pedidos');
            const orders = await res.json();

            const tbody = document.getElementById('orders-table-body');
            if (!tbody) return;

            tbody.innerHTML = '';
            orders.forEach(order => {
                const tr = document.createElement('tr');
                tr.className = 'hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors group';

                const statusConfig = {
                    pago: { label: 'Pago', color: 'green' },
                    pendente: { label: 'Pendente', color: 'yellow' },
                    cancelado: { label: 'Cancelado', color: 'red' },
                };
                const st = statusConfig[order.payment_status] || statusConfig.pendente;
                const initials = App.getInitials(order.client_name);

                tr.innerHTML = `
                    <td class="px-6 py-4 font-medium text-text-main-light dark:text-text-main-dark flex items-center gap-3">
                        <div class="h-8 w-8 rounded-full bg-primary-light dark:bg-primary/20 text-primary flex items-center justify-center text-xs font-bold">${initials}</div>
                        <div>
                            <p>${order.client_name}</p>
                            <p class="text-xs text-text-secondary-light dark:text-text-secondary-dark font-normal">${order.client_company || ''}</p>
                        </div>
                    </td>
                    <td class="px-6 py-4 text-text-secondary-light dark:text-text-secondary-dark">${order.product_summary}</td>
                    <td class="px-6 py-4">
                        <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-${st.color}-100 text-${st.color}-700 dark:bg-${st.color}-500/20 dark:text-${st.color}-400">
                            <span class="w-1.5 h-1.5 rounded-full bg-${st.color}-500"></span> ${st.label}
                        </span>
                    </td>
                    <td class="px-6 py-4 font-medium text-text-main-light dark:text-text-main-dark">${App.formatCurrency(order.total)}</td>
                    <td class="px-6 py-4 text-right">
                        <button class="text-text-secondary-light hover:text-primary dark:text-text-secondary-dark dark:hover:text-primary p-2">
                            <span class="material-icons-round text-lg">more_vert</span>
                        </button>
                    </td>
                `;

                tbody.appendChild(tr);
            });
        } catch (err) {
            console.error('Orders load error:', err);
        }
    },

    _updateKPI(elementId, value, change) {
        const el = document.getElementById(elementId);
        if (!el) return;

        const valueEl = el.querySelector('.kpi-value');
        if (valueEl) valueEl.textContent = value;

        const changeEl = el.querySelector('.kpi-change');
        if (changeEl && change !== undefined) {
            const sign = change >= 0 ? '+' : '';
            changeEl.textContent = `${sign}${change.toFixed(1)}%`;
        }
    },
};

document.addEventListener('DOMContentLoaded', () => {
    Dashboard.init();
});

window.Dashboard = Dashboard;
