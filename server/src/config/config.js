require('dotenv').config();

module.exports = {
  PORT: process.env.PORT || 5000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  MONGO_URI: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/medshield',
  JWT_SECRET: process.env.JWT_SECRET || 'medshield_super_secure_jwt_secret_key_2026',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  CHROMA_URL: process.env.CHROMA_URL || 'http://localhost:8000',
  UPLOAD_DIR: process.env.UPLOAD_DIR || 'uploads/policies',
  CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:5173',
};
