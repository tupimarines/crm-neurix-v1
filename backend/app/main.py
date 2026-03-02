"""
Neurix CRM — FastAPI Application Entry Point
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import auth, leads, products, orders, dashboard, settings as settings_router, webhooks, keyword_rules, upload


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
        redirect_slashes=False,
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
    app.include_router(leads.router, prefix="/api/leads", tags=["Leads / Kanban"])
    app.include_router(products.router, prefix="/api/products", tags=["Produtos"])
    app.include_router(orders.router, prefix="/api/orders", tags=["Pedidos"])
    app.include_router(dashboard.router, prefix="/api/dashboard", tags=["Dashboard"])
    app.include_router(settings_router.router, prefix="/api/settings", tags=["Configurações"])
    app.include_router(webhooks.router, prefix="/api/webhooks", tags=["Webhooks"])
    app.include_router(keyword_rules.router, prefix="/api/keyword-rules", tags=["Regras de Keywords"])
    app.include_router(upload.router, prefix="/api/upload", tags=["Upload"])

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

    return app


app = create_app()
