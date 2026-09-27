import os

class Settings:
    PORT: int = int(os.getenv("PORT", 5001))
    MONGO_URI: str = os.getenv("MONGO_URI", "mongodb://127.0.0.1:27017/medshield")
    JWT_SECRET: str = os.getenv("JWT_SECRET", "medshield_super_secret_jwt_key_2026")
    JWT_EXPIRES_IN: str = os.getenv("JWT_EXPIRES_IN", "7d")
    CHROMA_HOST: str = os.getenv("CHROMA_HOST", "localhost")
    CHROMA_PORT: int = int(os.getenv("CHROMA_PORT", 8000))
    CHROMA_COLLECTION_NAME: str = os.getenv("CHROMA_COLLECTION_NAME", "policy_chunks")
    UPLOAD_DIR: str = os.getenv("UPLOAD_DIR", "uploads/policies")

settings = Settings()
