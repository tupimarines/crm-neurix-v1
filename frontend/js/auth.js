/**
 * Neurix CRM — Auth Module
 * Handles login, token storage, refresh, and session persistence (14 days).
 */

const AUTH_STORAGE_KEY = 'neurix_auth';
const API_BASE = window.NEURIX_API_BASE || '/api';

const Auth = {
    /**
     * Login with email and password.
     */
    async login(email, password) {
        const res = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || 'Falha no login');
        }

        const data = await res.json();
        this._saveSession(data);
        return data;
    },

    /**
     * Verify 2FA OTP code.
     */
    async verifyOTP(email, token) {
        const res = await fetch(`${API_BASE}/auth/verify-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, token }),
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || 'Código OTP inválido');
        }

        const data = await res.json();
        this._saveSession(data);
        return data;
    },

    /**
     * Refresh the access token using the stored refresh token.
     */
    async refreshToken() {
        const session = this.getSession();
        if (!session?.refresh_token) {
            this.logout();
            return null;
        }

        try {
            const res = await fetch(`${API_BASE}/auth/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refresh_token: session.refresh_token }),
            });

            if (!res.ok) {
                this.logout();
                return null;
            }

            const data = await res.json();
            this._saveSession(data);
            return data;
        } catch {
            this.logout();
            return null;
        }
    },

    /**
     * Logout and clear stored session.
     */
    async logout() {
        const session = this.getSession();
        if (session?.access_token) {
            try {
                await fetch(`${API_BASE}/auth/logout`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${session.access_token}`,
                    },
                });
            } catch {
                // Ignore errors on logout
            }
        }
        localStorage.removeItem(AUTH_STORAGE_KEY);
        window.location.href = '/index.html';
    },

    /**
     * Get the current session from localStorage.
     */
    getSession() {
        try {
            const raw = localStorage.getItem(AUTH_STORAGE_KEY);
            if (!raw) return null;
            const session = JSON.parse(raw);
            // Check expiration
            if (session.expires_at && Date.now() > session.expires_at) {
                return null; // Expired, but refresh_token may still work
            }
            return session;
        } catch {
            return null;
        }
    },

    /**
     * Get the access token (auto-refreshes if expired).
     */
    async getAccessToken() {
        let session = this.getSession();
        if (!session) {
            // Try refresh
            const refreshed = await this.refreshToken();
            if (!refreshed) return null;
            session = this.getSession();
        }
        return session?.access_token || null;
    },

    /**
     * Check if user is authenticated.
     */
    isAuthenticated() {
        const session = this.getSession();
        return !!session?.access_token;
    },

    /**
     * Make an authenticated API request.
     */
    async apiRequest(endpoint, options = {}) {
        const token = await this.getAccessToken();
        if (!token) {
            window.location.href = '/index.html';
            throw new Error('Não autenticado');
        }

        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            ...(options.headers || {}),
        };

        const res = await fetch(`${API_BASE}${endpoint}`, {
            ...options,
            headers,
        });

        if (res.status === 401) {
            // Try refresh once
            const refreshed = await this.refreshToken();
            if (refreshed) {
                headers['Authorization'] = `Bearer ${refreshed.access_token}`;
                return fetch(`${API_BASE}${endpoint}`, { ...options, headers });
            }
            window.location.href = '/index.html';
            throw new Error('Sessão expirada');
        }

        return res;
    },

    /**
     * Guard: redirect to login if not authenticated.
     */
    requireAuth() {
        if (!this.isAuthenticated()) {
            window.location.href = '/index.html';
            return false;
        }
        return true;
    },

    // ── Private Methods ──

    _saveSession(data) {
        const session = {
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            user: data.user,
            expires_at: Date.now() + (data.expires_in * 1000),
        };
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
    },
};

// Make globally available
window.Auth = Auth;
