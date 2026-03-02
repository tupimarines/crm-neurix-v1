/**
 * Neurix CRM — App Shell
 * Shared logic: sidebar navigation, dark mode toggle, notification helpers.
 */

const App = {
    /**
     * Initialize the app shell (sidebar navigation highlighting).
     */
    init() {
        this._highlightActiveNav();
        this._initDarkMode();
        this._initLogout();
        this._loadUserInfo();
    },

    /**
     * Show a toast notification.
     */
    toast(message, type = 'info') {
        const colors = {
            info: 'bg-primary text-white',
            success: 'bg-green-600 text-white',
            error: 'bg-red-600 text-white',
            warning: 'bg-yellow-500 text-slate-900',
        };

        const toast = document.createElement('div');
        toast.className = `fixed top-4 right-4 px-6 py-3 rounded-xl shadow-2xl z-[9999] ${colors[type] || colors.info} 
            text-sm font-medium transform transition-all duration-300 translate-x-full opacity-0`;
        toast.textContent = message;
        document.body.appendChild(toast);

        requestAnimationFrame(() => {
            toast.classList.remove('translate-x-full', 'opacity-0');
        });

        setTimeout(() => {
            toast.classList.add('translate-x-full', 'opacity-0');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    },

    /**
     * Format currency (BRL).
     */
    formatCurrency(value) {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL',
        }).format(value);
    },

    /**
     * Format relative date.
     */
    formatDate(dateStr) {
        const date = new Date(dateStr);
        return date.toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
        });
    },

    /**
     * Get initials from a name.
     */
    getInitials(name) {
        if (!name) return '?';
        return name.split(' ')
            .map(w => w[0])
            .filter(Boolean)
            .slice(0, 2)
            .join('')
            .toUpperCase();
    },

    // ── Private ──

    _highlightActiveNav() {
        const currentPage = window.location.pathname.split('/').pop() || 'index.html';
        const navMap = {
            'dashboard.html': 'Painel',
            'kanban.html': 'Funil de Vendas',
            'products.html': 'Produtos',
            'contacts.html': 'Contatos',
            'settings.html': 'Configurações',
        };

        document.querySelectorAll('nav a').forEach(link => {
            const text = link.textContent.trim();
            const isActive = navMap[currentPage] === text;

            if (isActive) {
                // Remove default styles and add active
                link.className = link.className
                    .replace(/text-text-secondary-light.*?transition-colors/g, '')
                    .replace(/text-slate-600.*?transition-all group/g, '');
                link.classList.add(
                    'bg-primary-light', 'dark:bg-primary/20',
                    'text-primary', 'font-medium'
                );
            }
        });
    },

    _initDarkMode() {
        // Check saved preference or system preference
        const saved = localStorage.getItem('neurix_dark_mode');
        if (saved === 'true' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
            document.documentElement.classList.add('dark');
        }
    },

    _initLogout() {
        document.querySelectorAll('[data-action="logout"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                Auth.logout();
            });
        });

        // Also handle the sidebar logout link
        document.querySelectorAll('a').forEach(link => {
            if (link.textContent.trim() === 'Sair' || link.querySelector('.material-icons-round')?.textContent === 'logout') {
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    Auth.logout();
                });
            }
        });
    },

    async _loadUserInfo() {
        try {
            const session = Auth.getSession();
            if (session?.user) {
                // Update user name in sidebar if element exists
                const nameEl = document.querySelector('[data-user-name]');
                if (nameEl) nameEl.textContent = session.user.email?.split('@')[0] || 'Usuário';

                const emailEl = document.querySelector('[data-user-email]');
                if (emailEl) emailEl.textContent = session.user.email || '';
            }
        } catch {
            // Not critical
        }
    },
};

// Auto-init on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});

window.App = App;
