"use client";

export default function AdminClientesPlaceholderPage() {
    return (
        <div className="max-w-2xl space-y-4">
            <h1 className="text-2xl font-bold font-display">Clientes CRM</h1>
            <div className="glass-effect rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-900/20 p-6 text-sm text-text-main-light dark:text-text-main-dark">
                <p className="font-semibold text-amber-900 dark:text-amber-100 mb-2">Dependência pendente</p>
                <p>
                    A API de clientes (<code className="text-xs bg-black/10 px-1 rounded">crm_clients</code> / router
                    dedicado) será entregue no <strong>Sprint 10</strong>. Esta seção não fica em branco — aguarde a
                    listagem e o CRUD por tenant/organização.
                </p>
            </div>
        </div>
    );
}
