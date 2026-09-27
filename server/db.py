"""
Database connection and initialization module for InsureAI FastAPI service.
Manages MongoDB async and sync connections, health checks, index creation,
and ObjectId standardization helpers.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Optional
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from pymongo import MongoClient
from pymongo.database import Database

try:
    from config import settings
except ImportError:
    from server.config import settings

logger = logging.getLogger("insureai.db")

motor_client: Optional[AsyncIOMotorClient] = None
db: Optional[AsyncIOMotorDatabase] = None

sync_mongo_client: Optional[MongoClient] = None
sync_db: Optional[Database] = None


def to_object_id(val: Any) -> Optional[ObjectId]:
    """
    Safely convert string or existing ObjectId to an ObjectId.
    Returns None if value is None or cannot be parsed as a valid ObjectId.
    """
    if val is None:
        return None
    if isinstance(val, ObjectId):
        return val
    if isinstance(val, str) and ObjectId.is_valid(val):
        try:
            return ObjectId(val)
        except Exception:
            return None
    return None


def serialize_doc(doc: Optional[dict[str, Any]]) -> Optional[dict[str, Any]]:
    """
    Recursively serialize ObjectId and other non-JSON types in a MongoDB document
    for clean API output.
    """
    if doc is None:
        return None
    res = {}
    for k, v in doc.items():
        if isinstance(v, ObjectId):
            res[k] = str(v)
        elif isinstance(v, list):
            res[k] = [
                str(item) if isinstance(item, ObjectId)
                else (serialize_doc(item) if isinstance(item, dict) else item)
                for item in v
            ]
        elif isinstance(v, dict):
            res[k] = serialize_doc(v)
        else:
            res[k] = v
    return res


def get_async_db() -> AsyncIOMotorDatabase:
    """Return the active Async Motor Database instance bound to current event loop."""
    global motor_client, db
    try:
        current_loop = asyncio.get_running_loop()
    except RuntimeError:
        current_loop = None

    client_loop = getattr(motor_client, "io_loop", None) or getattr(motor_client, "_loop", None)
    if db is None or (current_loop is not None and client_loop is not None and client_loop != current_loop):
        motor_client = AsyncIOMotorClient(settings.MONGO_URI)
        db_name = settings.MONGO_URI.split("/")[-1].split("?")[0] or "medshield"
        db = motor_client[db_name]
        logger.debug("Connected to Async MongoDB database: %s", db_name)
    return db


def get_sync_db() -> Database:
    """Return the active Synchronous PyMongo Database instance."""
    global sync_mongo_client, sync_db
    if sync_db is None:
        sync_mongo_client = MongoClient(settings.MONGO_URI)
        db_name = settings.MONGO_URI.split("/")[-1].split("?")[0] or "medshield"
        sync_db = sync_mongo_client[db_name]
        logger.info("Connected to Sync MongoDB database: %s", db_name)
    return sync_db


async def check_db_health() -> bool:
    """Check whether MongoDB is responsive."""
    try:
        database = get_async_db()
        res = await database.command("ping")
        return bool(res and res.get("ok") == 1)
    except Exception as exc:
        logger.error("MongoDB health check ping failed: %s", exc)
        return False


async def init_db() -> None:
    """
    Initialize database connection, test connectivity, and create required indexes:
      - users.email (unique)
      - policies.user_id
      - policies.status
      - policy_chunks.policy_id
      - policy_chunks.user_id
      - policy_chunks(policy_id, chunk_index) (unique compound)
      - conversations.user_id
      - conversations.updated_at
      - cost_estimates.user_id
      - cost_estimates.created_at
      - policy_comparisons.user_id
    """
    database = get_async_db()

    # Ping to verify connectivity
    try:
        await database.command("ping")
        logger.info("Successfully pinged MongoDB server.")
    except Exception as exc:
        logger.critical("Failed to connect to MongoDB at %s: %s", settings.MONGO_URI, exc)
        raise RuntimeError(f"MongoDB unavailable: {exc}") from exc

    # Create indexes
    logger.info("Ensuring required MongoDB indexes...")

    # Users
    await database.users.create_index("email", unique=True)

    # Policies
    await database.policies.create_index("user_id")
    await database.policies.create_index("status")

    # Policy chunks
    await database.policy_chunks.create_index("policy_id")
    await database.policy_chunks.create_index("user_id")
    await database.policy_chunks.create_index([("policy_id", 1), ("chunk_index", 1)], unique=True)

    # Conversations
    await database.conversations.create_index("user_id")
    await database.conversations.create_index("updated_at")

    # Cost estimates
    await database.cost_estimates.create_index("user_id")
    await database.cost_estimates.create_index("created_at")

    # Policy comparisons
    await database.policy_comparisons.create_index("user_id")

    logger.info("MongoDB indexes verified successfully.")
