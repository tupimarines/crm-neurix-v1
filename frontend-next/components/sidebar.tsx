"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useRef, useEffect } from "react";

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
    const router = useRouter();
    const [showProfile, setShowProfile] = useState(false);
    const profileRef = useRef<HTMLDivElement>(null);

    // Close popup when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
                setShowProfile(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleLogout = () => {
        localStorage.removeItem("token");
        router.push("/login");
    };

    return (
        <aside className="w-[280px] bg-surface-light dark:bg-surface-dark border-r border-border-light dark:border-border-dark flex-shrink-0 hidden md:flex flex-col transition-colors duration-200">
            {/* Logo — clickable → /dashboard */}
            <Link
                href="/dashboard"
                className="h-16 flex items-center px-6 border-b border-border-light dark:border-border-dark hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors"
            >
                <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-3xl">
                        hexagon
                    </span>
                    <span className="font-display font-bold text-xl tracking-tight text-text-main-light dark:text-text-main-dark">
                        Neurix<span className="text-primary">CRM</span>
                    </span>
                </div>
            </Link>

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
            <div className="p-4 border-t border-border-light dark:border-border-dark relative" ref={profileRef}>
                {/* Profile popup */}
                {showProfile && (
                    <div className="absolute bottom-full left-3 right-3 mb-2 bg-surface-light dark:bg-surface-dark rounded-xl shadow-2xl border border-border-light dark:border-border-dark p-4 z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
                        <div className="flex items-center gap-3 mb-4 pb-4 border-b border-border-light dark:border-border-dark">
                            <div className="h-12 w-12 rounded-full bg-gradient-to-tr from-primary to-purple-400 flex items-center justify-center text-white font-bold text-lg">
                                AF
                            </div>
                            <div>
                                <p className="font-semibold text-sm text-text-main-light dark:text-text-main-dark">
                                    Admin Fábrica
                                </p>
                                <p className="text-xs text-text-secondary-light dark:text-text-secondary-dark">
                                    Gerente
                                </p>
                            </div>
                        </div>
                        <div className="space-y-3 text-sm">
                            <div className="flex items-center gap-3 text-text-secondary-light dark:text-text-secondary-dark">
                                <span className="material-symbols-outlined text-lg">mail</span>
                                <span>admin@neurix.com</span>
                            </div>
                            <div className="flex items-center gap-3 text-text-secondary-light dark:text-text-secondary-dark">
                                <span className="material-symbols-outlined text-lg">phone</span>
                                <span>(11) 99999-0000</span>
                            </div>
                            <div className="flex items-center gap-3 text-text-secondary-light dark:text-text-secondary-dark">
                                <span className="material-symbols-outlined text-lg">badge</span>
                                <span>Administrador</span>
                            </div>
                        </div>
                        <button
                            onClick={() => setShowProfile(false)}
                            className="mt-4 w-full text-xs text-primary hover:underline text-center"
                        >
                            Editar Perfil
                        </button>
                    </div>
                )}

                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setShowProfile(!showProfile)}
                        className="h-9 w-9 rounded-full bg-gradient-to-tr from-primary to-purple-400 flex items-center justify-center text-white font-bold text-sm hover:scale-105 transition-transform cursor-pointer"
                    >
                        AF
                    </button>
                    <button
                        onClick={() => setShowProfile(!showProfile)}
                        className="flex-1 min-w-0 text-left cursor-pointer"
                    >
                        <p className="text-sm font-medium text-text-main-light dark:text-text-main-dark truncate">
                            Admin Fábrica
                        </p>
                        <p className="text-xs text-text-secondary-light dark:text-text-secondary-dark truncate">
                            admin@neurix.com
                        </p>
                    </button>
                    <button
                        onClick={handleLogout}
                        title="Sair"
                        className="text-text-secondary-light dark:text-text-secondary-dark hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 p-1.5 rounded-lg transition-all"
                    >
                        <span className="material-symbols-outlined text-lg">logout</span>
                    </button>
                </div>
            </div>
        </aside>
    );
}
