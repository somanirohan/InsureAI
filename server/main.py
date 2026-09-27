import logging
from contextlib import asynccontextmanager
import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from datetime import datetime

try:
    from routers import auth, policies, chat, cost, comparisons, dashboard
    from config import settings
    from db import check_async_connection, ensure_async_indexes, close_db_connections
except ImportError:
    from server.routers import auth, policies, chat, cost, comparisons, dashboard
    from server.config import settings
    from server.db import check_async_connection, ensure_async_indexes, close_db_connections

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("medshield.server")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: test and initialize MongoDB Atlas connection & indexes
    logger.info("Initializing InsurAI / MedShield backend services...")
    is_connected, db_info = await check_async_connection()
    if is_connected:
        logger.info(f"[MongoDB] Successfully verified connection to MongoDB Atlas (DB: '{db_info.get('database')}')")
        await ensure_async_indexes()
    else:
        logger.error(f"[MongoDB] Connection warning on startup: {db_info.get('error')}")
    yield
    # Shutdown: clean up DB connections
    logger.info("Closing database connections...")
    await close_db_connections()

app = FastAPI(
    title="MedShield FastAPI Backend",
    description="AI-Powered Insurance Policy Intelligence Assistant API",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(policies.router)
app.include_router(chat.router)
app.include_router(cost.router)
app.include_router(comparisons.router)
app.include_router(dashboard.router)

# WebSocket endpoint alias for root /ws/chat
app.add_api_websocket_route("/ws/chat", chat.websocket_chat_endpoint)

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception(f"Unhandled exception: {exc}")
    return JSONResponse(
        status_code=500,
        content={"error": str(exc), "message": "An internal server error occurred in MedShield API"}
    )

@app.get("/api/health")
async def health_check():
    db_ok, db_info = await check_async_connection()
    return {
        "status": "online" if db_ok else "degraded",
        "timestamp": datetime.utcnow().isoformat(),
        "service": "MedShield Insurance Policy Intelligence FastAPI Service",
        "version": "1.0.0",
        "backend_engine": "Python + FastAPI + Pydantic + Motor + ChromaDB",
        "database": {
            "type": "MongoDB Atlas",
            "connected": db_ok,
            "database": db_info.get("database", "insurai"),
            "collections_count": db_info.get("collections_count", 0)
        }
    }

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=settings.PORT, reload=True)
