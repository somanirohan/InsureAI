#!/usr/bin/env bash
# Quickstart script for InsureAI (FastAPI + React)
set -e

echo "=========================================="
echo "    InsureAI Local Development Servers    "
echo "=========================================="

# Verify MongoDB
if nc -z 127.0.0.1 27017 2>/dev/null; then
    echo "✅ MongoDB is running on port 27017."
else
    echo "⚠️  MongoDB does not appear to be running on 127.0.0.1:27017."
    echo "   Start it with: mongod --dbpath <data_dir> or brew services start mongodb-community"
fi

# Verify Ollama
if curl -s http://localhost:11434/api/tags >/dev/null 2>&1; then
    echo "✅ Ollama is running on port 11434."
else
    echo "⚠️  Ollama is not running on http://localhost:11434."
    echo "   Start it with: ollama serve"
fi

echo ""
echo "🚀 Starting FastAPI backend (:5001)..."
python3.11 server/main.py &
BACKEND_PID=$!

echo "🚀 Starting React frontend (:5173)..."
(cd client && npm run dev) &
FRONTEND_PID=$!

cleanup() {
    echo ""
    echo "Shutting down servers..."
    kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
    exit 0
}

trap cleanup INT TERM EXIT

echo ""
echo "================================================================"
echo " InsureAI is running!"
echo " • Frontend : http://localhost:5173"
echo " • Backend  : http://localhost:5001"
echo " • API Docs : http://localhost:5001/docs"
echo " • Demo Login: demo@medshield.ai / password123"
echo " Press Ctrl+C to stop both servers."
echo "================================================================"

wait
