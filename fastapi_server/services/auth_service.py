import jwt
import hashlib
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from fastapi import HTTPException, Security, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from bson import ObjectId

from fastapi_server.config import settings
from fastapi_server.db import get_async_db

security = HTTPBearer()

def hash_password(password: str) -> str:
    """Hash password using SHA-256 with secret salt"""
    salted = f"{password}_{settings.JWT_SECRET}".encode("utf-8")
    return hashlib.sha256(salted).hexdigest()

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify plain password against stored hash"""
    return hash_password(plain_password) == hashed_password

def create_access_token(user_id: str) -> str:
    """Generate JWT signed token"""
    payload = {
        "user_id": str(user_id),
        "exp": datetime.utcnow() + timedelta(days=7),
        "iat": datetime.utcnow()
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm="HS256")

async def get_current_user(credentials: HTTPAuthorizationCredentials = Security(security)) -> Dict[str, Any]:
    """FastAPI dependency to extract and verify authenticated user (Data Isolation NFR 5.3)"""
    token = credentials.credentials
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
        user_id = payload.get("user_id")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token payload")
    except Exception as e:
        raise HTTPException(status_code=401, detail="Invalid or expired authorization token")

    db = get_async_db()
    # Query user by ObjectId or string
    try:
        query_id = ObjectId(user_id)
    except Exception:
        query_id = user_id

    user = await db.users.find_one({"_id": query_id})
    if not user:
        # Fallback to string query
        user = await db.users.find_one({"_id": str(user_id)})

    if not user:
        raise HTTPException(status_code=401, detail="User account not found")

    user["_id"] = str(user["_id"])
    return user
