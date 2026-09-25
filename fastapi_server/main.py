import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from datetime import datetime

from fastapi_server.config import settings
from fastapi_server.routers import auth, policies, chat, cost, comparisons, dashboard

app = FastAPI(
    title="MedShield FastAPI Backend",
    description="AI-Powered Insurance Policy Intelligence Assistant API",
    version="1.0.0"
)

# CORS configuration to connect cleanly with Shravi's React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API Routers
app.include_router(auth.router)
app.include_router(policies.router)
app.include_router(chat.router)
app.include_router(cost.router)
app.include_router(comparisons.router)
app.include_router(dashboard.router)

# Centralized Request Validation and Error Handling
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"error": str(exc), "message": "An internal server error occurred in MedShield API"}
    )

@app.get("/api/health")
async def health_check():
    return {
        "status": "online",
        "timestamp": datetime.utcnow().isoformat(),
        "service": "MedShield Insurance Policy Intelligence FastAPI Service",
        "version": "1.0.0",
        "backend_engine": "Python + FastAPI + Pydantic + Motor + ChromaDB"
    }

if __name__ == "__main__":
    uvicorn.run("fastapi_server.main:app", host="0.0.0.0", port=settings.PORT, reload=True)
