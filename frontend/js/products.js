/**
 * Neurix CRM — Products Module
 * Handles product CRUD, rendering product cards and table.
 */

const Products = {
    async init() {
        if (!Auth.requireAuth()) return;
        await this.loadProducts();
        this._initNewProduct();
    },

    async loadProducts() {
        try {
            const res = await Auth.apiRequest('/products');
            if (!res.ok) throw new Error('Erro ao carregar produtos');
            const products = await res.json();
            this._renderProductCards(products);
            this._renderProductTable(products);
        } catch (err) {
            App.toast('Erro ao carregar produtos', 'error');
            console.error(err);
        }
    },

    _renderProductCards(products) {
        const grid = document.getElementById('product-cards-grid');
        if (!grid) return;

        grid.innerHTML = '';
        products.forEach(product => {
            const statusConfig = {
                em_estoque: { label: 'Em Estoque', bgColor: 'bg-green-100 dark:bg-green-900/30', textColor: 'text-green-700 dark:text-green-400' },
                baixo_estoque: { label: 'Baixo Estoque', bgColor: 'bg-yellow-100 dark:bg-yellow-900/30', textColor: 'text-yellow-700 dark:text-yellow-400' },
                esgotado: { label: 'Esgotado', bgColor: 'bg-red-100 dark:bg-red-900/30', textColor: 'text-red-700 dark:text-red-400' },
                rascunho: { label: 'Rascunho', bgColor: 'bg-slate-100 dark:bg-slate-800', textColor: 'text-slate-600 dark:text-slate-400' },
            };
            const st = statusConfig[product.status] || statusConfig.em_estoque;

            const card = document.createElement('div');
            card.className = 'bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden hover:shadow-md transition-shadow group';

            card.innerHTML = `
                <div class="h-40 bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
                    ${product.image_url
                    ? `<img src="${product.image_url}" alt="${product.name}" class="h-full w-full object-cover">`
                    : `<span class="material-icons-round text-primary/30 text-6xl">inventory_2</span>`
                }
                </div>
                <div class="p-4">
                    <div class="flex items-center justify-between mb-2">
                        <span class="text-sm font-semibold text-slate-800 dark:text-white">${product.name}</span>
                        <span class="${st.bgColor} ${st.textColor} text-xs px-2 py-0.5 rounded-full font-medium">${st.label}</span>
                    </div>
                    <p class="text-xs text-slate-500 dark:text-slate-400 mb-3 line-clamp-2">${product.description || ''}</p>
                    <div class="flex items-center justify-between">
                        <span class="text-lg font-bold text-primary">${App.formatCurrency(product.price)}</span>
                        <span class="text-xs text-slate-400">${product.weight || ''}</span>
                    </div>
                    ${product.lot_code ? `<p class="text-xs text-slate-400 mt-1">Lote: ${product.lot_code}</p>` : ''}
                </div>
            `;

            grid.appendChild(card);
        });
    },

    _renderProductTable(products) {
        const tbody = document.getElementById('product-table-body');
        if (!tbody) return;

        tbody.innerHTML = '';
        products.forEach(product => {
            const tr = document.createElement('tr');
            tr.className = 'hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors';

            const statusBadge = product.is_active
                ? '<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"><span class="w-1.5 h-1.5 rounded-full bg-green-500"></span>Ativo</span>'
                : '<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"><span class="w-1.5 h-1.5 rounded-full bg-slate-500"></span>Rascunho</span>';

            tr.innerHTML = `
                <td class="px-6 py-4 font-medium text-slate-900 dark:text-white">${product.name}</td>
                <td class="px-6 py-4">${statusBadge}</td>
                <td class="px-6 py-4">${App.formatCurrency(product.price)}</td>
                <td class="px-6 py-4 text-right">
                    <button class="text-slate-400 hover:text-primary transition-colors" onclick="Products.editProduct('${product.id}')">
                        <span class="material-icons-round">edit</span>
                    </button>
                </td>
            `;

            tbody.appendChild(tr);
        });
    },

    _initNewProduct() {
        const form = document.getElementById('new-product-form');
        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const formData = new FormData(form);
                const data = {
                    name: formData.get('name'),
                    price: parseFloat(formData.get('price')?.replace(',', '.') || '0'),
                    weight: formData.get('weight'),
                    description: formData.get('description'),
                    category: formData.get('category')?.toLowerCase().replace(/[^a-z_]/g, '_') || 'tradicional',
                    is_active: formData.get('is_active') === 'on',
                };

                try {
                    const res = await Auth.apiRequest('/products', {
                        method: 'POST',
                        body: JSON.stringify(data),
                    });

                    if (res.ok) {
                        App.toast('Produto criado com sucesso!', 'success');
                        await this.loadProducts();
                        form.reset();
                    } else {
                        App.toast('Erro ao criar produto', 'error');
                    }
                } catch (err) {
                    App.toast('Erro ao criar produto', 'error');
                }
            });
        }
    },

    editProduct(productId) {
        // TODO: Open edit panel
        App.toast('Editar produto (em breve)', 'info');
    },
};

document.addEventListener('DOMContentLoaded', () => {
    Products.init();
});

window.Products = Products;
