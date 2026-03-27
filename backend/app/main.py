"""
Neurix CRM — FastAPI Application Entry Point
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.observability import metrics
from app.routers import (
    admin_api,
    auth,
    catalog_search,
    dashboard,
    inboxes,
    keyword_rules,
    leads,
    orders,
    organizations,
    product_categories,
    products,
    promotions,
    settings as settings_router,
    upload,
    users,
    webhooks,
    whatsapp,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    cfg = get_settings()
    print(f"🚀 {cfg.APP_NAME} v{cfg.APP_VERSION} starting...")
    print(f"   Redis: {cfg.REDIS_HOST}:{cfg.REDIS_PORT}")
    print(f"   Supabase: {'✅ Configured' if cfg.SUPABASE_URL else '⚠️ Not configured'}")
    print(f"   Uazapi: {'✅ Configured' if cfg.UAZAPI_URL else '⚠️ Not configured'}")
    yield
    print(f"👋 {cfg.APP_NAME} shutting down...")


def create_app() -> FastAPI:
    cfg = get_settings()

    app = FastAPI(
        title=cfg.APP_NAME,
        version=cfg.APP_VERSION,
        description="Backend API para o Neurix Smart CRM — Gestão de Leads, Produtos, Pedidos e Integrações.",
        lifespan=lifespan,
    )

    # ── CORS ──
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cfg.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Routers ──
    app.include_router(auth.router, prefix="/api/auth", tags=["Autenticação"])
    app.include_router(admin_api.router, prefix="/api/admin", tags=["Console Admin"])
    app.include_router(organizations.router, prefix="/api/organizations", tags=["Organizações"])
    app.include_router(users.router, prefix="/api/users", tags=["Usuários (Admin)"])
    app.include_router(inboxes.router, prefix="/api/inboxes", tags=["Caixas de entrada"])
    app.include_router(leads.router, prefix="/api/leads", tags=["Leads / Kanban"])
    app.include_router(products.router, prefix="/api/products", tags=["Produtos"])
    app.include_router(product_categories.router, prefix="/api/product-categories", tags=["Categorias de Produto"])
    app.include_router(promotions.router, prefix="/api/promotions", tags=["Promoções"])
    app.include_router(catalog_search.router, prefix="/api/catalog", tags=["Busca de Catálogo"])
    app.include_router(orders.router, prefix="/api/orders", tags=["Pedidos"])
    app.include_router(dashboard.router, prefix="/api/dashboard", tags=["Dashboard"])
    app.include_router(settings_router.router, prefix="/api/settings", tags=["Configurações"])
    app.include_router(webhooks.router, prefix="/api/webhooks", tags=["Webhooks"])
    app.include_router(keyword_rules.router, prefix="/api/keyword-rules", tags=["Regras de Keywords"])
    app.include_router(upload.router, prefix="/api/upload", tags=["Upload"])
    app.include_router(whatsapp.router, prefix="/api/whatsapp", tags=["WhatsApp"])

    # ── Health Check ──
    @app.get("/api/health", tags=["Sistema"])
    async def health_check():
        return {
            "status": "ok",
            "app": cfg.APP_NAME,
            "version": cfg.APP_VERSION,
            "supabase_configured": bool(cfg.SUPABASE_URL),
            "redis_configured": bool(cfg.REDIS_HOST),
        }

    @app.get("/api/metrics", tags=["Sistema"])
    async def metrics_snapshot():
        return {"metrics": metrics.snapshot()}

    return app


app = create_app()
