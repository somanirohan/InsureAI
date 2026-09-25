from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime

class CitationModel(BaseModel):
    policy_id: Optional[str] = None
    chunk_vector_id: Optional[str] = None
    page_number: Optional[int] = None
    section_heading: Optional[str] = None

class MessageModel(BaseModel):
    message_id: str
    role: str
    content: str
    query_type: Optional[str] = None
    plain_language: Optional[str] = None
    confidence_level: Optional[str] = None
    verification_passed: Optional[bool] = None
    verification_notes: Optional[str] = None
    citations: List[CitationModel] = []
    created_at: Optional[datetime] = None

class QuestionRequest(BaseModel):
    conversation_id: Optional[str] = None
    policy_id: Optional[str] = None
    question: str
    plain_language_mode: bool = False

class ConversationResponse(BaseModel):
    id: str = Field(alias="_id")
    user_id: str
    policy_id: Optional[Any] = None
    title: str
    messages: List[MessageModel] = []
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        populate_by_name = True
