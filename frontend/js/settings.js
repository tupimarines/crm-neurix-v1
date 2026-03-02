/**
 * Neurix CRM — Settings Module
 * Handles user preferences, module management, and theme customization.
 */

const Settings = {
    async init() {
        if (!Auth.requireAuth()) return;
        await this.loadSettings();
        this._initColorPicker();
    },

    async loadSettings() {
        try {
            const res = await Auth.apiRequest('/settings');
            if (!res.ok) return;
            const settings = await res.json();

            // Apply saved primary color
            const colorSetting = settings.find(s => s.key === 'primary_color');
            if (colorSetting?.value) {
                this._applyColor(colorSetting.value);
            }
        } catch (err) {
            console.error('Settings load error:', err);
        }
    },

    _initColorPicker() {
        document.querySelectorAll('[data-color]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const color = btn.dataset.color;
                this._applyColor(color);

                // Save to backend
                try {
                    await Auth.apiRequest(`/settings/primary_color`, {
                        method: 'PUT',
                        body: JSON.stringify({ key: 'primary_color', value: color }),
                    });
                    App.toast('Cor atualizada!', 'success');
                } catch (err) {
                    App.toast('Erro ao salvar cor', 'error');
                }

                // Update button active state
                document.querySelectorAll('[data-color]').forEach(b => {
                    b.classList.remove('ring-2', 'ring-offset-2');
                    b.classList.remove('w-8', 'h-8');
                    b.classList.add('w-6', 'h-6');
                });
                btn.classList.add('ring-2', 'ring-offset-2');
                btn.classList.remove('w-6', 'h-6');
                btn.classList.add('w-8', 'h-8');
            });
        });
    },

    _applyColor(color) {
        // Override the --tw-primary CSS variable or use inline styles
        document.documentElement.style.setProperty('--primary-color', color);
        localStorage.setItem('neurix_primary_color', color);
    },
};

document.addEventListener('DOMContentLoaded', () => {
    Settings.init();
});

window.Settings = Settings;
