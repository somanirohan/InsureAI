"""
Chat and WebSocket RAG routes for InsureAI.
Provides canonical REST endpoint (/api/chat/message) and WebSocket streaming endpoint (/api/chat/ws)
powered by app.rag through the rag_service adapter.
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from datetime import datetime
from typing import Optional
import jwt
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, status

try:
    from config import settings
    from db import get_async_db, to_object_id
    from models.chat import QuestionRequest
    from services.auth_service import get_current_user
    from services.rag_service import rag_service
except ImportError:
    from server.config import settings
    from server.db import get_async_db, to_object_id
    from server.models.chat import QuestionRequest
    from server.services.auth_service import get_current_user
    from server.services.rag_service import rag_service

logger = logging.getLogger("insureai.chat")

router = APIRouter(prefix="/api/chat", tags=["Chat & RAG"])


@router.post("/message")
async def send_message(
    payload: QuestionRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    POST /api/chat/message
    Handles non-streaming question answering with access control and persistence.
    """
    question = (payload.question or "").strip()
    if not question:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Question cannot be empty.",
        )

    user_id_str = str(current_user["_id"])
    u_oid = to_object_id(user_id_str)
    db = get_async_db()

    # 1. Resolve and validate policy ownership & readiness
    p_oid = to_object_id(payload.policy_id) if payload.policy_id else None

    # Call adapter which validates ownership, checks status=='ready', loads facts, and queries app.rag
    try:
        rag_response = await rag_service.answer_question(
            user_id=user_id_str,
            policy_id=str(p_oid) if p_oid else None,
            question=question,
            plain_language_requested=payload.plain_language_mode,
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Error executing RAG query: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred while answering your question. Please try again.",
        )

    # 2. Manage conversation
    conv_id = payload.conversation_id
    c_oid = to_object_id(conv_id) if conv_id else None
    conversation = None

    if c_oid:
        conversation = await db.conversations.find_one({"_id": c_oid, "user_id": u_oid})

    if not conversation:
        title = question[:50] + "..." if len(question) > 50 else question
        conv_doc = {
            "user_id": u_oid,
            "policy_id": p_oid,
            "title": title,
            "messages": [],
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        }
        res = await db.conversations.insert_one(conv_doc)
        c_oid = res.inserted_id
        conv_id = str(c_oid)
    else:
        conv_id = str(conversation["_id"])

    # 3. Create user message record
    user_msg = {
        "message_id": str(uuid.uuid4()),
        "role": "user",
        "content": question,
        "query_type": None,
        "plain_language": None,
        "confidence_level": None,
        "verification_passed": None,
        "verification_notes": None,
        "citations": [],
        "created_at": datetime.utcnow(),
    }

    # 4. Create assistant message record
    assistant_msg = {
        "message_id": str(uuid.uuid4()),
        "role": "assistant",
        "content": rag_response["answer"],
        "query_type": rag_response["query_type"],
        "plain_language": rag_response["plain_language"],
        "confidence_level": rag_response["confidence_level"],
        "verification_passed": rag_response["verification_passed"],
        "verification_notes": rag_response["verification_notes"],
        "citations": rag_response["citations"],
        "created_at": datetime.utcnow(),
    }

    # 5. Persist to MongoDB conversation
    await db.conversations.update_one(
        {"_id": c_oid},
        {
            "$push": {"messages": {"$each": [user_msg, assistant_msg]}},
            "$set": {
                "policy_id": p_oid,
                "updated_at": datetime.utcnow(),
            },
        },
    )

    return {
        "success": True,
        "conversationId": conv_id,
        "userMessage": user_msg,
        "assistantMessage": assistant_msg,
    }


@router.get("/conversations")
async def get_conversations(current_user: dict = Depends(get_current_user)):
    """Retrieve all conversations for the authenticated user."""
    u_oid = to_object_id(current_user["_id"])
    db = get_async_db()

    conversations = (
        await db.conversations.find({"user_id": u_oid})
        .sort("updated_at", -1)
        .to_list(length=100)
    )
    for c in conversations:
        c["_id"] = str(c["_id"])
        if c.get("user_id"):
            c["user_id"] = str(c["user_id"])
        if c.get("policy_id"):
            c["policy_id"] = str(c["policy_id"])

    return {"conversations": conversations}


@router.get("/conversations/{conversation_id}")
async def get_conversation_by_id(
    conversation_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Retrieve a specific conversation by ID."""
    u_oid = to_object_id(current_user["_id"])
    c_oid = to_object_id(conversation_id)
    if not c_oid:
        raise HTTPException(status_code=404, detail="Conversation not found.")

    db = get_async_db()
    conversation = await db.conversations.find_one({"_id": c_oid, "user_id": u_oid})
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found.")

    conversation["_id"] = str(conversation["_id"])
    if conversation.get("user_id"):
        conversation["user_id"] = str(conversation["user_id"])
    if conversation.get("policy_id"):
        conversation["policy_id"] = str(conversation["policy_id"])

    return {"conversation": conversation}


# ── Canonical WebSocket Route: /api/chat/ws ────────────────────────────────────
@router.websocket("/ws")
@router.websocket("/ws/chat")
async def websocket_chat_endpoint(
    websocket: WebSocket,
    token: Optional[str] = Query(None),
):
    """
    Canonical WebSocket endpoint for chat streaming.
    Accepted client message schema:
      {
        "token": "<jwt>",
        "question": "...",
        "policy_id": "...",
        "conversation_id": null,
        "plain_language_mode": false
      }
    Server event sequence:
      - {"type": "connected"}
      - {"type": "status", "message": "..."}
      - {"type": "chunk", "token": "..."}
      - {"type": "complete", "query_type": "...", "confidence_level": "...", ...}
      - {"type": "error", "message": "..."}
    """
    await websocket.accept()

    def _auth_user(token_val: str) -> Optional[dict]:
        try:
            payload = jwt.decode(token_val, settings.JWT_SECRET, algorithms=["HS256"])
            uid = payload.get("sub") or payload.get("user_id")
            if uid:
                return {"user_id": str(uid)}
        except Exception:
            pass
        return None

    user_info = _auth_user(token) if token else None

    # Send connected event
    await websocket.send_json({"type": "connected"})

    try:
        while True:
            text = await websocket.receive_text()
            try:
                data = json.loads(text)
            except json.JSONDecodeError:
                await websocket.send_json({"type": "error", "message": "Invalid JSON format."})
                continue

            # Check authentication from message if not query param
            msg_token = data.get("token") or token
            if not user_info and msg_token:
                user_info = _auth_user(msg_token)

            if not user_info:
                await websocket.send_json({"type": "error", "message": "Authentication required."})
                continue

            question = (data.get("question") or "").strip()
            if not question:
                await websocket.send_json({"type": "error", "message": "Question cannot be empty."})
                continue

            policy_id = data.get("policy_id")
            plain_lang_mode = bool(data.get("plain_language_mode", False))
            user_id = user_info["user_id"]

            await websocket.send_json({"type": "status", "message": "Consulting policy intelligence engine..."})

            try:
                rag_res = await rag_service.answer_question(
                    user_id=user_id,
                    policy_id=policy_id,
                    question=question,
                    plain_language_requested=plain_lang_mode,
                )
            except HTTPException as http_exc:
                await websocket.send_json({"type": "error", "message": http_exc.detail})
                continue
            except Exception as exc:
                logger.exception("WebSocket RAG query error: %s", exc)
                await websocket.send_json({"type": "error", "message": "An error occurred while answering your question."})
                continue

            # Stream words with token chunks
            full_text = rag_res["answer"]
            words = full_text.split(" ")
            for i, w in enumerate(words):
                chunk_token = w + (" " if i < len(words) - 1 else "")
                await websocket.send_json({
                    "type": "chunk",
                    "token": chunk_token,
                })
                await asyncio.sleep(0.015)

            # Send complete event with final metadata
            await websocket.send_json({
                "type": "complete",
                "query_type": rag_res["query_type"],
                "confidence_level": rag_res["confidence_level"],
                "verification_passed": rag_res["verification_passed"],
                "verification_notes": rag_res["verification_notes"],
                "citations": rag_res["citations"],
                "plain_language": rag_res["plain_language"],
            })

    except WebSocketDisconnect:
        logger.debug("WebSocket client disconnected.")
    except Exception as exc:
        logger.warning("WebSocket exception: %s", exc)
        try:
            await websocket.send_json({"type": "error", "message": "Connection closed unexpectedly."})
            await websocket.close()
        except Exception:
            pass
