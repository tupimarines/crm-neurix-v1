import type { AuthMe } from "./api";

/** Usuários de tenant precisam de organização resolvida em GET /api/auth/me (perfil ou membership). Superadmin não. */
export function tenantNeedsOrganization(me: AuthMe): boolean {
    if (me.is_superadmin) return false;
    const oid = me.organization_id;
    return oid == null || String(oid).trim() === "";
}
