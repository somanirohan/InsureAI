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
    from models.chat import QuestionRequest, RenameConversationRequest
    from services.auth_service import get_current_user
    from services.rag_service import rag_service
except ImportError:
    from server.config import settings
    from server.db import get_async_db, to_object_id
    from server.models.chat import QuestionRequest, RenameConversationRequest
    from server.services.auth_service import get_current_user
    from server.services.rag_service import rag_service

logger = logging.getLogger("insureai.chat")

router = APIRouter(prefix="/api/chat", tags=["Chat & RAG"])


def generate_title(question: str) -> str:
    """Generate a clean, succinct chat session title from the initial user prompt."""
    cleaned = " ".join(question.strip().split())
    if not cleaned:
        return "New Conversation"
    if len(cleaned) <= 45:
        return cleaned
    truncated = cleaned[:45]
    last_space = truncated.rfind(" ")
    if last_space > 20:
        return truncated[:last_space] + "..."
    return truncated + "..."


async def save_chat_turn(
    db,
    user_id: str,
    policy_id: Optional[str],
    conversation_id: Optional[str],
    question: str,
    rag_response: dict,
) -> tuple[dict, dict, str, str]:
    """
    Persists a single Q&A turn to MongoDB:
    - Creates a new conversation with auto-generated title if none exists
    - Appends user and assistant messages with citations and verification metadata
    - Updates timestamps and associated policy
    Returns: (user_msg, assistant_msg, conv_id, conv_title)
    """
    u_oid = to_object_id(user_id)
    resolved_policy_id = policy_id or (
        rag_response.get("citations", [{}])[0].get("policy_id")
        if rag_response.get("citations")
        else None
    )
    p_oid = to_object_id(resolved_policy_id) if resolved_policy_id else None

    c_oid = to_object_id(conversation_id) if conversation_id else None
    conversation = None

    if c_oid and u_oid:
        conversation = await db.conversations.find_one({"_id": c_oid, "user_id": u_oid})

    now = datetime.utcnow()

    if not conversation:
        title = generate_title(question)
        conv_doc = {
            "user_id": u_oid,
            "policy_id": p_oid,
            "title": title,
            "messages": [],
            "created_at": now,
            "updated_at": now,
        }
        res = await db.conversations.insert_one(conv_doc)
        c_oid = res.inserted_id
        conv_id = str(c_oid)
        conv_title = title
    else:
        c_oid = conversation["_id"]
        conv_id = str(c_oid)
        conv_title = conversation.get("title") or generate_title(question)

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
        "created_at": now,
    }

    assistant_msg = {
        "message_id": str(uuid.uuid4()),
        "role": "assistant",
        "content": rag_response.get("answer", ""),
        "query_type": rag_response.get("query_type"),
        "plain_language": rag_response.get("plain_language"),
        "confidence_level": rag_response.get("confidence_level"),
        "verification_passed": rag_response.get("verification_passed"),
        "verification_notes": rag_response.get("verification_notes"),
        "citations": rag_response.get("citations") or [],
        "created_at": now,
    }

    update_fields = {"updated_at": now}
    if p_oid:
        update_fields["policy_id"] = p_oid

    await db.conversations.update_one(
        {"_id": c_oid},
        {
            "$push": {"messages": {"$each": [user_msg, assistant_msg]}},
            "$set": update_fields,
        },
    )

    return user_msg, assistant_msg, conv_id, conv_title


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
    db = get_async_db()

    # 1. Resolve and validate policy ownership & readiness via RAG adapter
    try:
        rag_response = await rag_service.answer_question(
            user_id=user_id_str,
            policy_id=payload.policy_id,
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

    # 2. Persist turn to MongoDB conversation
    user_msg, assistant_msg, conv_id, conv_title = await save_chat_turn(
        db=db,
        user_id=user_id_str,
        policy_id=payload.policy_id,
        conversation_id=payload.conversation_id,
        question=question,
        rag_response=rag_response,
    )

    return {
        "success": True,
        "conversationId": conv_id,
        "conversation_id": conv_id,
        "conversation_title": conv_title,
        "userMessage": user_msg,
        "assistantMessage": assistant_msg,
    }


@router.get("/conversations")
async def get_conversations(current_user: dict = Depends(get_current_user)):
    """Retrieve all conversations for the authenticated user sorted by recent activity."""
    u_oid = to_object_id(current_user["_id"])
    db = get_async_db()

    conversations = (
        await db.conversations.find({"user_id": u_oid})
        .sort("updated_at", -1)
        .to_list(length=100)
    )

    # Resolve policy names for badge displays
    policy_oids = [c["policy_id"] for c in conversations if c.get("policy_id")]
    policy_name_map = {}
    if policy_oids:
        policies = await db.policies.find(
            {"_id": {"$in": policy_oids}},
            {"_id": 1, "insurer_name": 1, "file_name": 1, "policy_name": 1},
        ).to_list(length=len(policy_oids))
        for p in policies:
            name = p.get("insurer_name") or p.get("policy_name") or p.get("file_name") or "Policy"
            policy_name_map[str(p["_id"])] = name

    result = []
    for c in conversations:
        c_id = str(c["_id"])
        p_id = str(c["policy_id"]) if c.get("policy_id") else None
        msgs = c.get("messages", [])
        last_msg = msgs[-1].get("content", "") if msgs else ""
        if len(last_msg) > 75:
            last_msg = last_msg[:75] + "..."

        result.append({
            "_id": c_id,
            "id": c_id,
            "user_id": str(c.get("user_id")),
            "policy_id": p_id,
            "policy_name": policy_name_map.get(p_id) if p_id else None,
            "title": c.get("title") or "Untitled session",
            "message_count": len(msgs),
            "last_message": last_msg,
            "created_at": c.get("created_at"),
            "updated_at": c.get("updated_at"),
        })

    return {"conversations": result}


@router.get("/conversations/{conversation_id}")
async def get_conversation_by_id(
    conversation_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Retrieve a specific conversation by ID with all messages and citations."""
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

    # Ensure each message has a message_id and standard fields
    for msg in conversation.get("messages", []):
        if not msg.get("message_id"):
            msg["message_id"] = str(uuid.uuid4())

    return {"conversation": conversation}


@router.patch("/conversations/{conversation_id}")
async def rename_conversation(
    conversation_id: str,
    payload: RenameConversationRequest,
    current_user: dict = Depends(get_current_user),
):
    """Rename a conversation title."""
    new_title = (payload.title or "").strip()
    if not new_title:
        raise HTTPException(status_code=400, detail="Title cannot be empty.")

    u_oid = to_object_id(current_user["_id"])
    c_oid = to_object_id(conversation_id)
    if not c_oid:
        raise HTTPException(status_code=404, detail="Conversation not found.")

    db = get_async_db()
    result = await db.conversations.update_one(
        {"_id": c_oid, "user_id": u_oid},
        {"$set": {"title": new_title, "updated_at": datetime.utcnow()}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Conversation not found.")

    return {"success": True, "title": new_title}


@router.delete("/conversations/{conversation_id}")
async def delete_conversation(
    conversation_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Delete a conversation and its messages."""
    u_oid = to_object_id(current_user["_id"])
    c_oid = to_object_id(conversation_id)
    if not c_oid:
        raise HTTPException(status_code=404, detail="Conversation not found.")

    db = get_async_db()
    result = await db.conversations.delete_one({"_id": c_oid, "user_id": u_oid})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Conversation not found.")

    return {"success": True, "message": "Conversation deleted."}


# ── Canonical WebSocket Route: /api/chat/ws ────────────────────────────────────
@router.websocket("/ws")
@router.websocket("/ws/chat")
async def websocket_chat_endpoint(
    websocket: WebSocket,
    token: Optional[str] = Query(None),
):
    """
    Canonical WebSocket endpoint for chat streaming with MongoDB persistence.
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
      - {"type": "complete", "conversation_id": "...", "query_type": "...", ...}
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

            # Persist chat turn to MongoDB (creates new conversation or appends to existing)
            db = get_async_db()
            user_msg, assistant_msg, conv_id, conv_title = await save_chat_turn(
                db=db,
                user_id=user_id,
                policy_id=policy_id,
                conversation_id=data.get("conversation_id"),
                question=question,
                rag_response=rag_res,
            )

            # Send complete event with final metadata AND conversation identifiers
            await websocket.send_json({
                "type": "complete",
                "conversation_id": conv_id,
                "conversationId": conv_id,
                "conversation_title": conv_title,
                "user_message_id": user_msg["message_id"],
                "assistant_message_id": assistant_msg["message_id"],
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

