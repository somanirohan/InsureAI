import os
from pathlib import Path
from dotenv import load_dotenv

# Ensure environment variables are loaded from root .env and server/.env
root_env = Path(__file__).resolve().parent.parent / ".env"
server_env = Path(__file__).resolve().parent / ".env"
if root_env.exists():
    load_dotenv(root_env, override=False)
if server_env.exists():
    load_dotenv(server_env, override=True)

class Settings:
    PORT: int = int(os.getenv("PORT", 5001))
    MONGO_URI: str = os.getenv(
        "MONGO_URI",
        "mongodb+srv://rohanjagdishsomani_db_user:N62wBcWLZNdmGwN7@insurai.v3ucvhs.mongodb.net"
    ).strip()
    MONGO_DB_NAME: str = os.getenv("MONGO_DB_NAME", "insurai").strip()
    JWT_SECRET: str = os.getenv("JWT_SECRET", "medshield_super_secure_jwt_secret_key_2026")
    JWT_EXPIRES_IN: str = os.getenv("JWT_EXPIRES_IN", "7d")
    CHROMA_HOST: str = os.getenv("CHROMA_HOST", "localhost")
    CHROMA_PORT: int = int(os.getenv("CHROMA_PORT", 8000))
    CHROMA_COLLECTION_NAME: str = os.getenv("CHROMA_COLLECTION_NAME", "policy_chunks")
    CHROMA_PERSIST_DIR: str = os.getenv("CHROMA_PERSIST_DIR", "./chroma_store")
    UPLOAD_DIR: str = os.getenv("UPLOAD_DIR", "uploads/policies")

settings = Settings()
