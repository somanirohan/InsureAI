"""
Unit tests for chat conversation persistence, auto-titling, and conversation management.
"""

import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime
from bson import ObjectId
import pytest

repo_root = Path(__file__).resolve().parent.parent.parent
server_dir = repo_root / "server"
for p in (str(repo_root), str(server_dir)):
    if p not in sys.path:
        sys.path.insert(0, p)

from server.routers.chat import generate_title, save_chat_turn


def test_generate_title_short():
    title = generate_title("What is my room rent limit?")
    assert title == "What is my room rent limit?"


def test_generate_title_long():
    long_q = "What is the waiting period for pre-existing diseases under the star comprehensive policy in tier 1 hospitals?"
    title = generate_title(long_q)
    assert len(title) <= 50
    assert title.endswith("...")
    assert "waiting period" in title


def test_generate_title_empty():
    assert generate_title("   ") == "New Conversation"


@pytest.mark.asyncio
async def test_save_chat_turn_creates_new_conversation():
    mock_db = MagicMock()
    mock_conversations = MagicMock()
    mock_db.conversations = mock_conversations

    # Simulate insert_one result
    inserted_oid = ObjectId()
    mock_conversations.insert_one = AsyncMock(return_value=MagicMock(inserted_id=inserted_oid))
    mock_conversations.find_one = AsyncMock(return_value=None)
    mock_conversations.update_one = AsyncMock()

    user_id = str(ObjectId())
    policy_id = str(ObjectId())
    question = "Does this policy cover robotic surgery?"
    rag_response = {
        "answer": "Yes, robotic surgery is covered up to the sum insured limit.",
        "query_type": "semantic",
        "plain_language": "Robotic surgery is paid for by your insurance.",
        "confidence_level": "high",
        "verification_passed": True,
        "verification_notes": "Verified against clause 4.2",
        "citations": [{"policy_id": policy_id, "page_number": 8, "section_heading": "Modern Treatments"}],
    }

    user_msg, assistant_msg, conv_id, conv_title = await save_chat_turn(
        db=mock_db,
        user_id=user_id,
        policy_id=policy_id,
        conversation_id=None,
        question=question,
        rag_response=rag_response,
    )

    assert conv_id == str(inserted_oid)
    assert conv_title == question
    assert user_msg["role"] == "user"
    assert user_msg["content"] == question
    assert assistant_msg["role"] == "assistant"
    assert assistant_msg["content"] == rag_response["answer"]
    assert assistant_msg["confidence_level"] == "high"
    assert assistant_msg["citations"] == rag_response["citations"]

    # Verify DB interactions
    mock_conversations.insert_one.assert_awaited_once()
    mock_conversations.update_one.assert_awaited_once()
    update_args = mock_conversations.update_one.await_args
    assert update_args[0][0] == {"_id": inserted_oid}
    assert "$push" in update_args[0][1]


@pytest.mark.asyncio
async def test_save_chat_turn_appends_to_existing_conversation():
    mock_db = MagicMock()
    mock_conversations = MagicMock()
    mock_db.conversations = mock_conversations

    existing_oid = ObjectId()
    user_oid = ObjectId()
    existing_doc = {
        "_id": existing_oid,
        "user_id": user_oid,
        "title": "Existing Session",
        "messages": [],
    }

    mock_conversations.find_one = AsyncMock(return_value=existing_doc)
    mock_conversations.update_one = AsyncMock()

    rag_response = {
        "answer": "The co-pay is 10%.",
        "query_type": "structured",
        "plain_language": None,
        "confidence_level": "high",
        "verification_passed": True,
        "verification_notes": None,
        "citations": [],
    }

    user_msg, assistant_msg, conv_id, conv_title = await save_chat_turn(
        db=mock_db,
        user_id=str(user_oid),
        policy_id=None,
        conversation_id=str(existing_oid),
        question="What is the co-pay?",
        rag_response=rag_response,
    )

    assert conv_id == str(existing_oid)
    assert conv_title == "Existing Session"
    assert user_msg["content"] == "What is the co-pay?"
    assert assistant_msg["content"] == "The co-pay is 10%."

    # insert_one should not be called since conversation already exists
    mock_conversations.insert_one = AsyncMock()
    mock_conversations.update_one.assert_awaited_once()
    mock_conversations.insert_one.assert_not_awaited()


@pytest.mark.asyncio
async def test_rename_conversation():
    from server.routers.chat import rename_conversation
    from server.models.chat import RenameConversationRequest

    mock_db = MagicMock()
    mock_conversations = MagicMock()
    mock_db.conversations = mock_conversations
    mock_conversations.update_one = AsyncMock(return_value=MagicMock(matched_count=1))

    c_id = str(ObjectId())
    user_id = str(ObjectId())
    current_user = {"_id": user_id}

    with patch("server.routers.chat.get_async_db", return_value=mock_db):
        resp = await rename_conversation(
            conversation_id=c_id,
            payload=RenameConversationRequest(title="Updated Title"),
            current_user=current_user,
        )

    assert resp == {"success": True, "title": "Updated Title"}
    mock_conversations.update_one.assert_awaited_once()


@pytest.mark.asyncio
async def test_delete_conversation():
    from server.routers.chat import delete_conversation

    mock_db = MagicMock()
    mock_conversations = MagicMock()
    mock_db.conversations = mock_conversations
    mock_conversations.delete_one = AsyncMock(return_value=MagicMock(deleted_count=1))

    c_id = str(ObjectId())
    user_id = str(ObjectId())
    current_user = {"_id": user_id}

    with patch("server.routers.chat.get_async_db", return_value=mock_db):
        resp = await delete_conversation(
            conversation_id=c_id,
            current_user=current_user,
        )

    assert resp == {"success": True, "message": "Conversation deleted."}
    mock_conversations.delete_one.assert_awaited_once()

