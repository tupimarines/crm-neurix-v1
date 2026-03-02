import Sidebar from "@/components/sidebar";

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="flex h-screen overflow-hidden bg-background-light dark:bg-background-dark text-text-main-light dark:text-text-main-dark">
            <Sidebar />
            {/* Mobile header */}
            <div className="flex-1 flex flex-col min-w-0">
                <header className="md:hidden bg-surface-light dark:bg-surface-dark border-b border-border-light dark:border-border-dark px-4 py-3 flex items-center justify-between sticky top-0 z-20">
                    <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary text-2xl">
                            hexagon
                        </span>
                        <span className="font-display font-bold text-lg">Neurix</span>
                    </div>
                    <button className="text-text-main-light dark:text-text-main-dark">
                        <span className="material-symbols-outlined">menu</span>
                    </button>
                </header>
                <main className="flex-1 overflow-y-auto">{children}</main>
            </div>
        </div>
    );
}
