"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
    { href: "/dashboard", icon: "dashboard", label: "Painel" },
    { href: "/kanban", icon: "view_kanban", label: "Funil de Vendas" },
    { href: "/produtos", icon: "inventory_2", label: "Produtos" },
];

const systemItems = [
    { href: "/configuracoes", icon: "settings", label: "Configurações" },
];

export default function Sidebar() {
    const pathname = usePathname();

    return (
        <aside className="w-[280px] bg-surface-light dark:bg-surface-dark border-r border-border-light dark:border-border-dark flex-shrink-0 hidden md:flex flex-col transition-colors duration-200">
            {/* Logo */}
            <div className="h-16 flex items-center px-6 border-b border-border-light dark:border-border-dark">
                <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-3xl">
                        hexagon
                    </span>
                    <span className="font-display font-bold text-xl tracking-tight text-text-main-light dark:text-text-main-dark">
                        Neurix<span className="text-primary">CRM</span>
                    </span>
                </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 overflow-y-auto py-6 px-3 space-y-1">
                {navItems.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${isActive
                                    ? "bg-primary-light dark:bg-primary/20 text-primary font-medium"
                                    : "text-text-secondary-light dark:text-text-secondary-dark hover:bg-slate-100 dark:hover:bg-slate-700/50 hover:text-primary"
                                }`}
                        >
                            <span
                                className={`material-symbols-outlined ${isActive ? "filled" : ""}`}
                            >
                                {item.icon}
                            </span>
                            <span className="text-sm">{item.label}</span>
                        </Link>
                    );
                })}

                {/* Separator */}
                <div className="pt-4 mt-4 border-t border-border-light dark:border-border-dark">
                    <span className="px-3 text-xs font-semibold text-text-secondary-light dark:text-text-secondary-dark uppercase tracking-wider">
                        Sistema
                    </span>
                </div>

                {systemItems.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`flex items-center gap-3 px-3 py-2.5 mt-2 rounded-xl transition-colors ${isActive
                                    ? "bg-primary-light dark:bg-primary/20 text-primary font-medium"
                                    : "text-text-secondary-light dark:text-text-secondary-dark hover:bg-slate-100 dark:hover:bg-slate-700/50 hover:text-primary"
                                }`}
                        >
                            <span
                                className={`material-symbols-outlined ${isActive ? "filled" : ""}`}
                            >
                                {item.icon}
                            </span>
                            <span className="text-sm">{item.label}</span>
                        </Link>
                    );
                })}
            </nav>

            {/* User Profile */}
            <div className="p-4 border-t border-border-light dark:border-border-dark">
                <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-gradient-to-tr from-primary to-purple-400 flex items-center justify-center text-white font-bold text-sm">
                        AF
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-text-main-light dark:text-text-main-dark truncate">
                            Admin Fábrica
                        </p>
                        <p className="text-xs text-text-secondary-light dark:text-text-secondary-dark truncate">
                            admin@neurix.com
                        </p>
                    </div>
                    <button className="text-text-secondary-light dark:text-text-secondary-dark hover:text-red-500 transition-colors">
                        <span className="material-symbols-outlined text-lg">logout</span>
                    </button>
                </div>
            </div>
        </aside>
    );
}
