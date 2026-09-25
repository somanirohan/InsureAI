from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime

class UserRegister(BaseModel):
    full_name: str
    email: str
    password: str
    phone: Optional[str] = None

class UserLogin(BaseModel):
    email: str
    password: str

class UserResponse(BaseModel):
    id: str = Field(alias="_id")
    full_name: str
    email: str
    phone: Optional[str] = None
    is_active: bool = True
    created_at: Optional[datetime] = None

    class Config:
        populate_by_name = True
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }

class AuthTokenResponse(BaseModel):
    token: str
    user: UserResponse
