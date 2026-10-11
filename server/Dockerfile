# Use an official Python runtime as a parent image
FROM python:3.11-slim

# Prevent Python from writing .pyc files and buffer stdout/stderr
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app:/app/server \
    ALLOWED_ORIGINS=* \
    PORT=5001

# Internal Ollama runs inside this same container on 127.0.0.1:11434
ENV OLLAMA_BASE_URL=http://127.0.0.1:11434 \
    OLLAMA_EMBEDDING_MODEL=nomic-embed-text \
    OLLAMA_TIMEOUT_SECONDS=30 \
    EMBEDDING_PROVIDER=ollama

# Install system dependencies (including tesseract for OCR, zstd for Ollama extraction) and Ollama binary
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    zstd \
    procps \
    tesseract-ocr \
    tesseract-ocr-eng \
    libmupdf-dev \
    && curl -fsSL https://ollama.com/install.sh | sh \
    && rm -rf /var/lib/apt/lists/*

# Set working directory to /app/server
WORKDIR /app/server

# Install Python dependencies first for caching layers
COPY requirements.txt /app/server/requirements.txt
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r /app/server/requirements.txt

# Copy server code into /app/server
COPY . /app/server

# Ensure startup script is executable
RUN chmod +x /app/server/start.sh

# Pre-download nomic-embed-text at build time into the container image
# so startup is instant and Ollama never needs to download over the network at runtime
RUN ollama serve > /dev/null 2>&1 & \
    PID=$! && \
    sleep 3 && \
    ollama pull nomic-embed-text && \
    kill $PID 2>/dev/null || true

# Expose container application port
EXPOSE 5001

# Start Ollama daemon in background and launch FastAPI via start.sh
CMD ["/app/server/start.sh"]
