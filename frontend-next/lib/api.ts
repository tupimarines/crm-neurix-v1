export function getApiBase(): string {
    const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    if (typeof window !== "undefined" && base.startsWith("http://") && window.location.protocol === "https:") {
        return base.replace("http://", "https://");
    }
    return base;
}

/** URL para chamadas à API. Usa path relativo quando mesmo host (evita Mixed Content). */
export function getApiUrl(path: string): string {
    const pathNorm = path.startsWith("/") ? path : `/${path}`;
    if (typeof window !== "undefined") {
        try {
            const base = getApiBase();
            const url = new URL(base);
            if (url.host === window.location.host) {
                return pathNorm;
            }
        } catch {
            /* fallback para full URL */
        }
    }
    const base = getApiBase().replace(/\/$/, "");
    return base + pathNorm;
}

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

    const res = await fetch(`${getApiBase()}${endpoint}`, {
        headers,
        ...rest,
    });

    if (!res.ok) {
        if (res.status === 401 && typeof window !== 'undefined') {
            localStorage.removeItem("access_token");
            window.location.href = "/login";
        }
        const raw = await res.text().catch(() => "");
        let detail = res.statusText;
        if (raw) {
            try {
                const parsed = JSON.parse(raw);
                detail = parsed.detail || parsed.message || raw;
            } catch {
                detail = raw;
            }
        }
        throw new Error(detail || `API Error ${res.status}`);
    }
    if (res.status === 204) {
        return undefined as T;
    }
    const raw = await res.text();
    if (!raw) {
        return undefined as T;
    }
    return JSON.parse(raw) as T;
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

export const apiPatch = <T = unknown>(endpoint: string, body: unknown, token?: string) =>
    api<T>(endpoint, { method: "PATCH", body: JSON.stringify(body), token });

// ── Auth / RBAC (Sprint 5 — Console Admin) ──

export type AuthMe = {
    id: string;
    email: string;
    full_name?: string | null;
    role?: string | null;
    avatar_url?: string | null;
    is_superadmin: boolean;
    organization_id?: string | null;
};

export const getAuthMe = (token?: string) => apiGet<AuthMe>("/api/auth/me", token);

// ── Organizações ──

export type OrganizationDTO = {
    id: string;
    name: string;
    created_at: string;
    updated_at: string;
};

export type OrganizationMemberDTO = {
    id: string;
    organization_id: string;
    user_id: string;
    role: "admin" | "read_only";
    assigned_funnel_id?: string | null;
    created_at: string;
};

export const getOrganizations = (token?: string) =>
    apiGet<OrganizationDTO[]>("/api/organizations/", token);

export const createOrganization = (body: { name: string }, token?: string) =>
    apiPost<OrganizationDTO>("/api/organizations/", body, token);

export const updateOrganization = (orgId: string, body: { name: string }, token?: string) =>
    apiPatch<OrganizationDTO>(`/api/organizations/${orgId}`, body, token);

export const deleteOrganization = (orgId: string, token?: string) =>
    apiDelete<void>(`/api/organizations/${orgId}`, token);

export const getOrganization = (orgId: string, token?: string) =>
    apiGet<OrganizationDTO>(`/api/organizations/${orgId}`, token);

export const listOrgMembers = (orgId: string, token?: string) =>
    apiGet<OrganizationMemberDTO[]>(`/api/organizations/${orgId}/members`, token);

export type AddOrgMemberBody = {
    user_id: string;
    role: "admin" | "read_only";
    assigned_funnel_id?: string | null;
};

export const addOrgMember = (orgId: string, body: AddOrgMemberBody, token?: string) =>
    apiPost<OrganizationMemberDTO>(`/api/organizations/${orgId}/members`, body, token);

export type PatchOrgMemberBody = {
    role?: "admin" | "read_only";
    assigned_funnel_id?: string | null;
};

export const updateOrgMember = (
    orgId: string,
    memberUserId: string,
    body: PatchOrgMemberBody,
    token?: string
) =>
    apiPatch<OrganizationMemberDTO>(
        `/api/organizations/${orgId}/members/${memberUserId}`,
        body,
        token
    );

export const removeOrgMember = (orgId: string, memberUserId: string, token?: string) =>
    apiDelete<void>(`/api/organizations/${orgId}/members/${memberUserId}`, token);

/** Funis atribuíveis na org (admins da org) — Sprint 6 */
export type OrganizationFunnelItem = {
    id: string;
    tenant_id: string;
    name: string;
    created_at: string;
    updated_at: string;
};

export const listOrganizationFunnels = (orgId: string, token?: string) =>
    apiGet<OrganizationFunnelItem[]>(`/api/organizations/${orgId}/funnels`, token);

/** Console Admin — superadmin apenas */
export const getAdminProducts = (tenantId: string, token?: string) =>
    apiGet<
        Array<{
            id: string;
            name: string;
            price: number;
            stock_quantity?: number;
            is_active?: boolean;
            category?: string | null;
        }>
    >(`/api/admin/products?${new URLSearchParams({ tenant_id: tenantId }).toString()}`, token);

export const getAdminFunnels = (tenantId: string, token?: string) =>
    apiGet<OrganizationFunnelItem[]>(
        `/api/admin/funnels?${new URLSearchParams({ tenant_id: tenantId }).toString()}`,
        token
    );

// ── Usuários (Auth Admin API via backend) ──

export type CreateUserBody = {
    organization_id: string;
    email: string;
    password: string;
    full_name: string;
    company_name?: string | null;
    phones: string[];
    role: "admin" | "read_only";
    assigned_funnel_id?: string | null;
};

export type OrganizationUserResponse = {
    id: string;
    email?: string | null;
    full_name?: string | null;
    company_name?: string | null;
    phones: string[];
    organization_id: string;
    role: string;
    assigned_funnel_id?: string | null;
    created_at: string;
};

export const createUser = (body: CreateUserBody, token?: string) =>
    apiPost<OrganizationUserResponse>("/api/users/", body, token);

export type UserDetailResponse = {
    id: string;
    email?: string | null;
    full_name?: string | null;
    company_name?: string | null;
    phones: string[];
    memberships: { organization_id: string; role: string; assigned_funnel_id?: string | null }[];
};

export const getUser = (userId: string, token?: string) =>
    apiGet<UserDetailResponse>(`/api/users/${userId}`, token);

export type PatchUserBody = {
    full_name?: string;
    company_name?: string | null;
    phones?: string[];
    role?: "admin" | "read_only";
    assigned_funnel_id?: string | null;
};

export const patchUser = (userId: string, organizationId: string, body: PatchUserBody, token?: string) => {
    const q = new URLSearchParams({ organization_id: organizationId });
    return apiPatch<{ organization_id: string; role: string; assigned_funnel_id?: string | null }>(
        `/api/users/${userId}?${q.toString()}`,
        body,
        token
    );
};

// ── Funis do tenant (lista para Configurações / inboxes) — Sprint 8 ──

export type FunnelListItem = {
    id: string;
    tenant_id: string;
    name: string;
    created_at: string;
    updated_at: string;
};

export const listMyFunnels = (token?: string) => apiGet<FunnelListItem[]>("/api/funnels/", token);

/** 200 se usuário pode gerenciar inboxes (org admin); 403 caso contrário (ex.: read_only). */
export const probeOrgAdmin = (token?: string) =>
    apiGet<{ ok: boolean; scope: string }>("/api/auth/rbac/org-admin", token);

// ── Caixas de entrada (inboxes) — Sprint 7 ──

export type InboxDTO = {
    id: string;
    tenant_id: string;
    funnel_id: string;
    name: string;
    uazapi_settings: Record<string, unknown>;
    created_at: string;
    updated_at: string;
};

export type CreateInboxBody = {
    name: string;
    funnel_id: string;
    uazapi_settings?: Record<string, unknown>;
};

export type UpdateInboxBody = {
    name?: string;
    funnel_id?: string;
    uazapi_settings?: Record<string, unknown>;
};

/** Lista inboxes do tenant; superadmin pode passar tenantId (query tenant_id). */
export const listInboxes = (token?: string, tenantId?: string) => {
    const q = tenantId ? `?${new URLSearchParams({ tenant_id: tenantId }).toString()}` : "";
    return apiGet<InboxDTO[]>(`/api/inboxes/${q}`, token);
};

export const getInbox = (inboxId: string, token?: string) =>
    apiGet<InboxDTO>(`/api/inboxes/${inboxId}`, token);

export const createInbox = (body: CreateInboxBody, token?: string) =>
    apiPost<InboxDTO>("/api/inboxes/", body, token);

export const updateInbox = (inboxId: string, body: UpdateInboxBody, token?: string) =>
    apiPatch<InboxDTO>(`/api/inboxes/${inboxId}`, body, token);

export const deleteInbox = (inboxId: string, token?: string) =>
    apiDelete<void>(`/api/inboxes/${inboxId}`, token);

/** Console Admin — somente superadmin */
export const listAdminInboxes = (tenantId: string, token?: string) =>
    apiGet<InboxDTO[]>(
        `/api/admin/inboxes?${new URLSearchParams({ tenant_id: tenantId }).toString()}`,
        token
    );

// ── WhatsApp Instance Management (escopo opcional por inbox) ──

function whatsappInboxQuery(inboxId?: string) {
    return inboxId ? `?${new URLSearchParams({ inbox_id: inboxId }).toString()}` : "";
}

export const getWhatsappStatus = (token?: string, inboxId?: string) =>
    apiGet<{ status: string; data?: unknown; message?: string; scope?: string }>(
        `/api/whatsapp/status${whatsappInboxQuery(inboxId)}`,
        token
    );

export const initWhatsappInstance = (instanceName: string, token?: string, inboxId?: string) =>
    apiPost<{ message: string; token: string }>(
        "/api/whatsapp/init",
        { instance_name: instanceName, ...(inboxId ? { inbox_id: inboxId } : {}) },
        token
    );

export const connectWhatsappInstance = (token?: string, inboxId?: string) =>
    apiPost<{ message: string; data: unknown; scope?: string }>(
        `/api/whatsapp/connect${whatsappInboxQuery(inboxId)}`,
        {},
        token
    );

export const saveWhatsappToken = (instanceToken: string, token?: string, inboxId?: string) =>
    apiPost<{ message: string; status: string }>(
        "/api/whatsapp/token",
        { instance_token: instanceToken, ...(inboxId ? { inbox_id: inboxId } : {}) },
        token
    );

export const disconnectWhatsappInstance = (token?: string, inboxId?: string) =>
    apiDelete<{ message: string }>(`/api/whatsapp/disconnect${whatsappInboxQuery(inboxId)}`, token);
