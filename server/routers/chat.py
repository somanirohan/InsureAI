import uuid
import json
import asyncio
from datetime import datetime
from typing import Optional
from bson import ObjectId
from fastapi import APIRouter, HTTPException, Depends, WebSocket, WebSocketDisconnect, Query

try:
    from models.chat import QuestionRequest
    from services.auth_service import get_current_user
    from services.rag_service import rag_service
    from db import get_async_db
except ImportError:
    from server.models.chat import QuestionRequest
    from server.services.auth_service import get_current_user
    from server.services.rag_service import rag_service
    from server.db import get_async_db

router = APIRouter(prefix="/api/chat", tags=["Chat & RAG"])

@router.post("/message")
async def send_message(payload: QuestionRequest, current_user: dict = Depends(get_current_user)):
    user_id = str(current_user["_id"])
    db = get_async_db()

    conv_id = payload.conversation_id
    conversation = None

    if conv_id:
        try:
            c_id = ObjectId(conv_id)
        except Exception:
            c_id = conv_id
        conversation = await db.conversations.find_one({"_id": c_id, "user_id": user_id})

    if not conversation:
        title = payload.question[:45] + "..." if len(payload.question) > 45 else payload.question
        conv_doc = {
            "user_id": user_id,
            "policy_id": payload.policy_id,
            "title": title,
            "messages": [],
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }
        res = await db.conversations.insert_one(conv_doc)
        conv_id = str(res.inserted_id)
        conversation = conv_doc
        conversation["_id"] = conv_id
    else:
        conv_id = str(conversation["_id"])

    user_msg = {
        "message_id": str(uuid.uuid4()),
        "role": "user",
        "content": payload.question,
        "query_type": None,
        "plain_language": None,
        "confidence_level": None,
        "verification_passed": None,
        "verification_notes": None,
        "citations": [],
        "created_at": datetime.utcnow()
    }

    rag_response = await rag_service.answer_question(
        user_id=user_id,
        policy_id=payload.policy_id,
        question=payload.question,
        plain_language_requested=payload.plain_language_mode
    )

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
        "created_at": datetime.utcnow()
    }

    try:
        c_id = ObjectId(conv_id)
    except Exception:
        c_id = conv_id

    await db.conversations.update_one(
        {"_id": c_id},
        {
            "$push": {"messages": {"$each": [user_msg, assistant_msg]}},
            "$set": {"updated_at": datetime.utcnow()}
        }
    )

    return {
        "success": True,
        "conversationId": conv_id,
        "userMessage": user_msg,
        "assistantMessage": assistant_msg
    }

@router.get("/conversations")
async def get_conversations(current_user: dict = Depends(get_current_user)):
    user_id = str(current_user["_id"])
    db = get_async_db()

    conversations = await db.conversations.find({"user_id": user_id}).sort("updated_at", -1).to_list(length=100)
    for c in conversations:
        c["_id"] = str(c["_id"])
        if c.get("policy_id"):
            c["policy_id"] = str(c["policy_id"])

    return {"conversations": conversations}

@router.get("/conversations/{conversation_id}")
async def get_conversation_by_id(conversation_id: str, current_user: dict = Depends(get_current_user)):
    user_id = str(current_user["_id"])
    db = get_async_db()

    try:
        c_id = ObjectId(conversation_id)
    except Exception:
        c_id = conversation_id

    conversation = await db.conversations.find_one({"_id": c_id, "user_id": user_id})
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    conversation["_id"] = str(conversation["_id"])
    return {"conversation": conversation}

@router.websocket("/ws")
@router.websocket("/ws/chat")
async def websocket_chat_endpoint(websocket: WebSocket, token: Optional[str] = Query(None)):
    await websocket.accept()
    try:
        try:
            from services.auth_service import settings, jwt
        except ImportError:
            from server.services.auth_service import settings, jwt

        user_id = None
        if token:
            try:
                payload = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
                user_id = payload.get("user_id")
            except Exception:
                pass

        await websocket.send_json({"type": "connected", "message": "Connected to MedShield WebSocket RAG Stream"})

        while True:
            data = await websocket.receive_text()
            req = json.loads(data)

            msg_token = req.get("token") or token
            if not user_id and msg_token:
                try:
                    payload = jwt.decode(msg_token, settings.JWT_SECRET, algorithms=["HS256"])
                    user_id = payload.get("user_id")
                except Exception:
                    await websocket.send_json({"type": "error", "message": "Invalid or expired authentication token"})
                    continue

            if not user_id:
                await websocket.send_json({"type": "error", "message": "Authentication required"})
                continue

            question = req.get("question", "")
            policy_id = req.get("policy_id")
            plain_language = req.get("plain_language_mode", False)

            if not question:
                continue

            rag_response = await rag_service.answer_question(user_id, policy_id, question, plain_language)

            full_answer = rag_response["answer"]
            words = full_answer.split()

            await websocket.send_json({
                "type": "start",
                "query_type": rag_response["query_type"],
                "queryType": rag_response["query_type"],
                "confidence_level": rag_response["confidence_level"],
                "confidenceLevel": rag_response["confidence_level"],
                "verification_passed": rag_response["verification_passed"],
                "verificationPassed": rag_response["verification_passed"],
                "citations": rag_response["citations"]
            })

            for word in words:
                await websocket.send_json({
                    "type": "chunk",
                    "token": word + " ",
                    "text": word + " "
                })
                await asyncio.sleep(0.015)

            await websocket.send_json({
                "type": "complete",
                "plain_language": rag_response["plain_language"],
                "query_type": rag_response["query_type"],
                "queryType": rag_response["query_type"],
                "confidence_level": rag_response["confidence_level"],
                "confidenceLevel": rag_response["confidence_level"],
                "verification_passed": rag_response["verification_passed"],
                "verificationPassed": rag_response["verification_passed"],
                "citations": rag_response["citations"]
            })

    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
            await websocket.close()
        except Exception:
            pass
