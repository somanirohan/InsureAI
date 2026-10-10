from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime

class UserRegister(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=100)
    email: str = Field(..., min_length=5, max_length=100)
    password: str = Field(..., min_length=6, max_length=128)
    phone: Optional[str] = None

class UserLogin(BaseModel):
    email: str = Field(..., min_length=5, max_length=100)
    password: str = Field(..., min_length=1, max_length=128)

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
