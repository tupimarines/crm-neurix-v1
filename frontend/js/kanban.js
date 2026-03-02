/**
 * Neurix CRM — Kanban Board Logic
 * Handles drag-and-drop, lead CRUD, and stage transitions.
 */

const Kanban = {
    board: null,

    async init() {
        if (!Auth.requireAuth()) return;
        this.board = document.getElementById('kanban-board');
        await this.loadBoard();
        this._initDragAndDrop();
        this._initNewLead();
    },

    async loadBoard() {
        try {
            const res = await Auth.apiRequest('/leads/kanban');
            if (!res.ok) throw new Error('Erro ao carregar kanban');
            const data = await res.json();
            this._renderBoard(data.columns);
        } catch (err) {
            App.toast('Erro ao carregar o funil de vendas', 'error');
            console.error(err);
        }
    },

    _renderBoard(columns) {
        if (!this.board) return;

        columns.forEach(column => {
            const colEl = this.board.querySelector(`[data-stage="${column.stage}"]`);
            if (!colEl) return;

            // Update count
            const countEl = colEl.querySelector('.lead-count');
            if (countEl) countEl.textContent = column.count;

            // Update total value
            const valueEl = colEl.querySelector('.lead-total-value');
            if (valueEl) valueEl.textContent = App.formatCurrency(column.total_value);

            // Render cards
            const cardsContainer = colEl.querySelector('.kanban-cards');
            if (!cardsContainer) return;

            cardsContainer.innerHTML = '';
            column.leads.forEach(lead => {
                cardsContainer.appendChild(this._createCard(lead));
            });
        });
    },

    _createCard(lead) {
        const card = document.createElement('div');
        card.className = 'kanban-card bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-100 dark:border-slate-700 cursor-grab active:cursor-grabbing transition-shadow hover:shadow-md';
        card.draggable = true;
        card.dataset.leadId = lead.id;

        const priorityColors = {
            alta: 'bg-red-500',
            media: 'bg-yellow-500',
            baixa: 'bg-green-500',
        };

        const priorityDot = lead.priority
            ? `<span class="w-2 h-2 rounded-full ${priorityColors[lead.priority] || 'bg-slate-400'}"></span>`
            : '';

        card.innerHTML = `
            <div class="flex items-start justify-between mb-2">
                <div class="flex items-center gap-2">
                    ${priorityDot}
                    <span class="text-sm font-semibold text-slate-800 dark:text-white">${lead.company_name}</span>
                </div>
                <button class="text-slate-400 hover:text-primary text-sm" onclick="Kanban.editLead('${lead.id}')">
                    <span class="material-icons-round text-base">more_vert</span>
                </button>
            </div>
            <p class="text-xs text-slate-500 dark:text-slate-400 mb-3">${lead.contact_name}</p>
            <div class="flex items-center justify-between">
                <span class="text-xs font-bold text-primary">${App.formatCurrency(lead.value)}</span>
                ${lead.whatsapp_chat_id ? `
                <button class="text-green-500 hover:text-green-600" onclick="Kanban.openWhatsApp('${lead.whatsapp_chat_id}')">
                    <span class="material-icons-round text-base">chat</span>
                </button>` : ''}
            </div>
        `;

        return card;
    },

    _initDragAndDrop() {
        if (!this.board) return;

        this.board.addEventListener('dragstart', (e) => {
            const card = e.target.closest('.kanban-card');
            if (!card) return;
            card.classList.add('opacity-50');
            e.dataTransfer.setData('text/plain', card.dataset.leadId);
        });

        this.board.addEventListener('dragend', (e) => {
            const card = e.target.closest('.kanban-card');
            if (card) card.classList.remove('opacity-50');
        });

        // Allow drop on column containers
        this.board.querySelectorAll('.kanban-cards').forEach(container => {
            container.addEventListener('dragover', (e) => {
                e.preventDefault();
                container.classList.add('bg-primary/5');
            });

            container.addEventListener('dragleave', () => {
                container.classList.remove('bg-primary/5');
            });

            container.addEventListener('drop', async (e) => {
                e.preventDefault();
                container.classList.remove('bg-primary/5');

                const leadId = e.dataTransfer.getData('text/plain');
                const column = container.closest('[data-stage]');
                const newStage = column?.dataset.stage;

                if (!leadId || !newStage) return;

                try {
                    const res = await Auth.apiRequest(`/leads/${leadId}/stage`, {
                        method: 'PATCH',
                        body: JSON.stringify({ stage: newStage }),
                    });

                    if (res.ok) {
                        App.toast('Lead movido com sucesso', 'success');
                        await this.loadBoard();
                    } else {
                        App.toast('Erro ao mover lead', 'error');
                    }
                } catch (err) {
                    App.toast('Erro ao mover lead', 'error');
                }
            });
        });
    },

    _initNewLead() {
        const btn = document.getElementById('btn-new-lead');
        if (btn) {
            btn.addEventListener('click', () => {
                // TODO: Open new lead modal
                App.toast('Criar novo lead (em breve)', 'info');
            });
        }
    },

    editLead(leadId) {
        // TODO: Open edit modal
        App.toast('Editar lead (em breve)', 'info');
    },

    openWhatsApp(chatId) {
        // Open WhatsApp Web with the number
        const phone = chatId.replace('@s.whatsapp.net', '');
        window.open(`https://wa.me/${phone}`, '_blank');
    },
};

document.addEventListener('DOMContentLoaded', () => {
    Kanban.init();
});

window.Kanban = Kanban;
