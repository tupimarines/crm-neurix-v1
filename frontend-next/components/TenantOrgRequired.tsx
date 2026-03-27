"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { getAuthMe, type AuthMe } from "@/lib/api";
import { tenantNeedsOrganization } from "@/lib/org-context";

type Props = { children: ReactNode };

export function TenantOrgRequired({ children }: Props) {
    const [me, setMe] = useState<AuthMe | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const t = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
        if (!t) {
            setLoading(false);
            return;
        }
        getAuthMe(t)
            .then(setMe)
            .catch(() => setMe(null))
            .finally(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <div className="flex flex-1 items-center justify-center min-h-[40vh]">
                <span className="material-symbols-outlined text-primary text-4xl animate-spin">progress_activity</span>
            </div>
        );
    }

    if (me && tenantNeedsOrganization(me)) {
        return (
            <div className="flex flex-1 flex-col items-center justify-center p-8 text-center max-w-lg mx-auto min-h-[50vh]">
                <span className="material-symbols-outlined text-5xl text-amber-500 mb-4">domain</span>
                <h1 className="text-xl font-display font-bold mb-2">Organização necessária</h1>
                <p className="text-text-secondary-light dark:text-text-secondary-dark text-sm mb-6">
                    Sua conta ainda não está vinculada a uma organização. Peça a um administrador para adicioná-lo à
                    equipe ou entre em contato com o suporte.
                </p>
                <Link
                    href="/dashboard"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary-hover"
                >
                    Voltar ao painel
                </Link>
            </div>
        );
    }

    return <>{children}</>;
}
