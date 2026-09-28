"""
Database connection and initialization module for InsureAI FastAPI service.
Manages MongoDB async and sync connections, health checks, index creation,
and ObjectId standardization helpers.
"""

from __future__ import annotations

import asyncio
import logging
import os
from urllib.parse import urlparse
from typing import Any, Optional
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from pymongo import MongoClient
from pymongo.database import Database

try:
    import certifi
    ca_file = certifi.where()
except Exception:
    ca_file = None

try:
    from config import settings
except ImportError:
    from server.config import settings

logger = logging.getLogger("insureai.db")

motor_client: Optional[AsyncIOMotorClient] = None
db: Optional[AsyncIOMotorDatabase] = None

sync_mongo_client: Optional[MongoClient] = None
sync_db: Optional[Database] = None

_active_uri: Optional[str] = None


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


def _extract_db_name(uri: str, default: str = "insurai") -> str:
    """Safely extract the database name from a MongoDB URI, falling back to configured default."""
    configured_default = getattr(settings, "MONGO_DB_NAME", default) or default
    if not uri:
        return configured_default
    try:
        clean_uri = uri.strip()
        parsed = urlparse(clean_uri)
        path = parsed.path.strip("/")
        if path:
            candidate = path.split("?")[0].strip()
            # Must be a valid MongoDB database name: no dots, slashes, spaces, @, etc.
            if candidate and not any(c in candidate for c in (".", "/", "\\", " ", '"', "$", "*", "@")):
                return candidate
    except Exception:
        pass
    return configured_default


def _get_client_kwargs(uri: str) -> dict:
    """Return robust client keyword arguments for MongoDB connections."""
    kwargs = {
        "serverSelectionTimeoutMS": 4000,
        "connectTimeoutMS": 4000,
        "retryWrites": True,
        "appName": "InsureAI",
    }
    is_tls = "mongodb+srv" in uri or "ssl=true" in uri.lower() or "tls=true" in uri.lower()
    if is_tls and ca_file and os.path.exists(ca_file):
        kwargs["tlsCAFile"] = ca_file
    return kwargs


def _determine_working_sync_uri() -> str:
    global _active_uri
    if _active_uri:
        return _active_uri

    target_uri = getattr(settings, "MONGO_URI", "").strip()
    local_uri = "mongodb://127.0.0.1:27017/insurai"
    candidate_uris = [target_uri] if target_uri else []
    if local_uri not in candidate_uris:
        candidate_uris.append(local_uri)

    for uri in candidate_uris:
        if not uri:
            continue
        try:
            kwargs = _get_client_kwargs(uri)
            test_client = MongoClient(uri, **kwargs)
            test_client.admin.command("ping")
            test_client.close()
            _active_uri = uri
            logger.info("MongoDB connectivity confirmed on: %s", uri.split("@")[-1] if "@" in uri else uri)
            return uri
        except Exception:
            continue

    _active_uri = target_uri or local_uri
    return _active_uri


def _get_effective_uri() -> str:
    global _active_uri
    if _active_uri:
        return _active_uri
    return _determine_working_sync_uri()


def get_async_db() -> AsyncIOMotorDatabase:
    """Return the active Async Motor Database instance bound to current event loop."""
    global motor_client, db
    try:
        current_loop = asyncio.get_running_loop()
    except RuntimeError:
        current_loop = None

    client_loop = getattr(motor_client, "io_loop", None) or getattr(motor_client, "_loop", None)
    if db is None or (current_loop is not None and client_loop is not None and client_loop != current_loop):
        uri = _get_effective_uri()
        kwargs = _get_client_kwargs(uri)
        motor_client = AsyncIOMotorClient(uri, **kwargs)
        db_name = _extract_db_name(uri, "insurai")
        db = motor_client[db_name]
        logger.debug("Connected to Async MongoDB database: %s", db_name)
    return db


def get_sync_db() -> Database:
    """Return the active Synchronous PyMongo Database instance."""
    global sync_mongo_client, sync_db
    if sync_db is None:
        uri = _determine_working_sync_uri()
        kwargs = _get_client_kwargs(uri)
        sync_mongo_client = MongoClient(uri, **kwargs)
        db_name = _extract_db_name(uri, "insurai")
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
    Initialize database connection, test connectivity, create required indexes,
    and fall back to local MongoDB if Atlas IP is blocked by network whitelist.
    """
    global _active_uri, motor_client, db, sync_mongo_client, sync_db

    target_uri = getattr(settings, "MONGO_URI", "").strip()
    local_uri = "mongodb://127.0.0.1:27017/insurai"

    # Step 1: Try configured MONGO_URI, then local_uri
    connected = False
    candidate_uris = [target_uri] if target_uri else []
    if local_uri not in candidate_uris:
        candidate_uris.append(local_uri)

    for uri in candidate_uris:
        if not uri:
            continue
        try:
            logger.info("Connecting to MongoDB at: %s ...", uri.split("@")[-1] if "@" in uri else uri)
            kwargs = _get_client_kwargs(uri)
            test_client = AsyncIOMotorClient(uri, **kwargs)
            await test_client.admin.command("ping")
            test_client.close()

            _active_uri = uri
            motor_client = None
            db = None
            sync_mongo_client = None
            sync_db = None

            connected = True
            logger.info("Successfully connected to MongoDB: %s", uri.split("@")[-1] if "@" in uri else uri)
            break
        except Exception as exc:
            err_str = str(exc)
            if "SSL" in err_str or "TLS" in err_str or "ServerSelectionTimeoutError" in err_str:
                logger.warning(
                    "MongoDB connection attempt failed for %s (%s).",
                    uri.split("@")[-1] if "@" in uri else uri,
                    err_str.split(":")[0],
                )
            else:
                logger.warning("MongoDB connection failed for %s: %s", uri, exc)

    if not connected:
        msg = (
            f"Failed to connect to MongoDB ({target_uri}). If using MongoDB Atlas, "
            "ensure your current public IP address is added to the Atlas Network Access IP Whitelist (or 0.0.0.0/0)."
        )
        logger.critical(msg)
        raise RuntimeError(msg)

    database = get_async_db()

    # Create indexes safely
    logger.info("Ensuring required MongoDB indexes on database '%s'...", database.name)
    try:
        # Users
        await database.users.create_index("email", unique=True)

        # Policies
        await database.policies.create_index("user_id")
        await database.policies.create_index("status")

        # Policy chunks
        await database.policy_chunks.create_index("policy_id")
        await database.policy_chunks.create_index("user_id")
        await database.policy_chunks.create_index([("policy_id", 1), ("chunk_index", 1)])

        # Conversations
        await database.conversations.create_index("user_id")
        await database.conversations.create_index("updated_at")

        # Cost estimates
        await database.cost_estimates.create_index("user_id")
        await database.cost_estimates.create_index("created_at")

        # Policy comparisons
        await database.policy_comparisons.create_index("user_id")

        logger.info("MongoDB indexes verified successfully.")
    except Exception as exc:
        logger.warning("Note on index verification: %s", exc)


async def close_db() -> None:
    """Gracefully close motor and sync mongo clients."""
    global motor_client, db, sync_mongo_client, sync_db
    if motor_client is not None:
        motor_client.close()
        motor_client = None
        db = None
    if sync_mongo_client is not None:
        sync_mongo_client.close()
        sync_mongo_client = None
        sync_db = None
