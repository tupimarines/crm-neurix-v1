"use client";

import Link from "next/link";

export default function AdminInboxesLinkPage() {
    return (
        <div className="max-w-2xl space-y-6">
            <h1 className="text-2xl font-bold font-display">Configurações / Inboxes</h1>
            <p className="text-sm text-text-secondary-light">
                O fluxo completo de conexão Uazapi (QR, instância, Leads Infinitos) permanece em{" "}
                <strong>Configurações</strong> no app tenant — Sprint 8 evoluirá para caixas de entrada por funil.
            </p>
            <Link
                href="/configuracoes?from=admin"
                className="inline-flex h-11 items-center px-6 rounded-xl bg-primary text-white font-semibold text-sm"
            >
                Abrir Configurações
            </Link>
            <p className="text-xs text-text-secondary-light">
                O parâmetro <code className="bg-black/5 px-1 rounded">from=admin</code> será usado no Sprint 8 para
                banner &quot;Voltar ao Console&quot;.
            </p>
        </div>
    );
}
