from fastapi import APIRouter, HTTPException, Depends, status
from datetime import datetime

try:
    from models.user import UserRegister, UserLogin, UserResponse, AuthTokenResponse
    from services.auth_service import hash_password, verify_password, create_access_token, get_current_user
    from db import get_async_db
except ImportError:
    from server.models.user import UserRegister, UserLogin, UserResponse, AuthTokenResponse
    from server.services.auth_service import hash_password, verify_password, create_access_token, get_current_user
    from server.db import get_async_db

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

@router.post("/register", response_model=AuthTokenResponse, status_code=status.HTTP_201_CREATED)
async def register(payload: UserRegister):
    db = get_async_db()

    existing = await db.users.find_one({"email": payload.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="User account with this email already exists")

    pwd_hash = hash_password(payload.password)
    user_doc = {
        "full_name": payload.full_name,
        "email": payload.email.lower(),
        "password_hash": pwd_hash,
        "phone": payload.phone,
        "is_active": True,
        "created_at": datetime.utcnow(),
        "last_login_at": datetime.utcnow()
    }

    res = await db.users.insert_one(user_doc)
    user_id = str(res.inserted_id)

    token = create_access_token(user_id)
    user_doc["_id"] = user_id

    return {
        "token": token,
        "user": user_doc
    }

@router.post("/login", response_model=AuthTokenResponse)
async def login(payload: UserLogin):
    db = get_async_db()

    user = await db.users.find_one({"email": payload.email.lower()})
    if not user or not verify_password(payload.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid credentials provided")

    user_id = str(user["_id"])
    await db.users.update_one({"_id": user["_id"]}, {"$set": {"last_login_at": datetime.utcnow()}})

    token = create_access_token(user_id)
    user["_id"] = user_id

    return {
        "token": token,
        "user": user
    }

@router.get("/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    return {"user": current_user}
