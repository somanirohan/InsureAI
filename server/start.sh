#!/bin/sh
set -e

echo "Starting Ollama service in background..."
ollama serve > /var/log/ollama.log 2>&1 &
OLLAMA_PID=$!

# Wait for Ollama server to become responsive
echo "Waiting for Ollama to be ready..."
for i in $(seq 1 30); do
    if curl -s http://127.0.0.1:11434/api/tags > /dev/null 2>&1; then
        echo "Ollama is ready!"
        break
    fi
    sleep 1
done

# Pull the required embedding model if not already present
EMBED_MODEL="${OLLAMA_EMBEDDING_MODEL:-nomic-embed-text}"
echo "Checking/pulling Ollama model '${EMBED_MODEL}'..."
ollama pull "$EMBED_MODEL" || echo "Warning: Failed to pull ${EMBED_MODEL}, will fall back if needed."

echo "Starting Uvicorn server on port ${PORT:-5001}..."
exec uvicorn main:app --host 0.0.0.0 --port "${PORT:-5001}"
