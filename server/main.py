"""
InsureAI FastAPI Backend Application.
The central orchestration layer connecting React frontend to the advanced app/ RAG engine,
ChromaDB vector store, and MongoDB application store.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from datetime import datetime
import uvicorn
from fastapi import FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

try:
    from config import settings
    from db import check_db_health, init_db
    from routers import auth, chat, comparisons, cost, dashboard, policies
except ImportError:
    from server.config import settings
    from server.db import check_db_health, init_db
    from server.routers import auth, chat, comparisons, cost, dashboard, policies

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
)
logger = logging.getLogger("insureai.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown lifecycle management."""
    logger.info("Initializing InsureAI FastAPI application...")
    try:
        await init_db()
        logger.info("MongoDB initialized and verified.")
    except Exception as exc:
        logger.critical("Fatal error initializing MongoDB: %s", exc)
        raise

    yield

    logger.info("InsureAI backend shutting down.")


app = FastAPI(
    title="InsureAI FastAPI Backend",
    description="AI-Powered Insurance Policy Intelligence Assistant API",
    version="1.0.0",
    lifespan=lifespan,
)

# ── CORS Security ─────────────────────────────────────────────────────────────
# Only allow explicitly configured frontend origins with credentials
allowed_origins = settings.ALLOWED_ORIGINS if isinstance(settings.ALLOWED_ORIGINS, list) else [settings.CLIENT_URL]
if not allowed_origins:
    allowed_origins = ["http://localhost:5173", "http://127.0.0.1:5173"]

# ── CORS Security ─────────────────────────────────────────────────────────────
# Only allow explicitly configured frontend origins with credentials
allowed_origins = settings.ALLOWED_ORIGINS if isinstance(settings.ALLOWED_ORIGINS, list) else [settings.CLIENT_URL]
if not allowed_origins:
    allowed_origins = ["http://localhost:5173", "http://127.0.0.1:5173"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["*"],
)

# ── Include Routers ───────────────────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(policies.router)
app.include_router(chat.router)
app.include_router(cost.router)
app.include_router(comparisons.router)
app.include_router(dashboard.router)

# ── Canonical WebSocket Routes ────────────────────────────────────────────────
app.add_api_websocket_route("/api/chat/ws", chat.websocket_chat_endpoint)
app.add_api_websocket_route("/ws/chat", chat.websocket_chat_endpoint)


# ── Global Exception Handler ──────────────────────────────────────────────────
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled server exception on %s %s: %s", request.method, request.url.path, exc)

    if settings.ENVIRONMENT == "production":
        err_msg = "An unexpected error occurred. Please try again later."
    else:
        err_msg = str(exc)

    return JSONResponse(
        status_code=500,
        content={"error": err_msg, "message": "Internal server error occurred."},
    )


# ── Health Check ──────────────────────────────────────────────────────────────
@app.get("/api/health")
async def health_check():
    """Health check endpoint. Fails if MongoDB is unreachable."""
    is_db_healthy = await check_db_health()
    if not is_db_healthy:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "status": "unhealthy",
                "database": "disconnected",
                "timestamp": datetime.utcnow().isoformat(),
                "service": "InsureAI Intelligence API",
            },
        )

    return {
        "status": "online",
        "database": "connected",
        "timestamp": datetime.utcnow().isoformat(),
        "service": "InsureAI Intelligence API",
        "version": "1.0.0",
        "backend_engine": "Python + FastAPI + Advanced RAG (app/) + ChromaDB + MongoDB",
    }


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=settings.PORT, reload=True)
