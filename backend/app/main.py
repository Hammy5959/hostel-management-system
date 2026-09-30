"""FastAPI application entry point.

Run with:  uvicorn app.main:app --reload   (from the backend/ directory)
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import DEFAULT_APP_NAME, get_settings
from app.core.exceptions import register_handlers
from app.core.logging import setup_logging


def create_app() -> FastAPI:
    settings = get_settings()
    setup_logging()

    app = FastAPI(
        title=f"{settings.app_name or DEFAULT_APP_NAME} API",
        version="0.1.0",
        description="Production-oriented Student Hostel Management System backend.",
        docs_url="/docs",
        openapi_url="/openapi.json",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(api_router, prefix=settings.api_v1_prefix)
    register_handlers(app)

    @app.get("/health", tags=["system"], summary="Health check")
    def health() -> dict:
        return {"status": "ok", "service": settings.app_name or DEFAULT_APP_NAME, "environment": settings.environment}

    return app


app = create_app()
