const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface ApiOptions extends RequestInit {
    token?: string;
}

export async function api<T = unknown>(
    endpoint: string,
    options: ApiOptions = {}
): Promise<T> {
    const { token, headers: customHeaders, ...rest } = options;

    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...((customHeaders as Record<string, string>) || {}),
    };

    if (token) {
        headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch(`${API_BASE}${endpoint}`, {
        headers,
        ...rest,
    });

    if (!res.ok) {
        const error = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(error.detail || `API Error ${res.status}`);
    }

    return res.json();
}

// Convenience methods
export const apiGet = <T = unknown>(endpoint: string, token?: string) =>
    api<T>(endpoint, { method: "GET", token });

export const apiPost = <T = unknown>(endpoint: string, body: unknown, token?: string) =>
    api<T>(endpoint, { method: "POST", body: JSON.stringify(body), token });

export const apiPut = <T = unknown>(endpoint: string, body: unknown, token?: string) =>
    api<T>(endpoint, { method: "PUT", body: JSON.stringify(body), token });

export const apiDelete = <T = unknown>(endpoint: string, token?: string) =>
    api<T>(endpoint, { method: "DELETE", token });

// ── WhatsApp Instance Management ──
export const getWhatsappStatus = (token?: string) =>
    apiGet<{ status: string; data?: any }>("/api/whatsapp/status", token);

export const connectWhatsappInstance = (instanceName: string, token?: string) =>
    apiPost<{ message: string; data: any }>("/api/whatsapp/connect", { instance_name: instanceName }, token);

export const saveWhatsappToken = (instanceToken: string, token?: string) =>
    apiPost<{ message: string; status: string }>("/api/whatsapp/token", { instance_token: instanceToken }, token);

export const disconnectWhatsappInstance = (token?: string) =>
    apiDelete<{ message: string }>("/api/whatsapp/disconnect", token);
