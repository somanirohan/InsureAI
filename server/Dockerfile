# Use an official Python runtime as a parent image
FROM python:3.11-slim

# Prevent Python from writing .pyc files and buffer stdout/stderr
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app \
    PORT=5001

# Set working directory to container root
WORKDIR /app

# Install system dependencies (including tesseract for OCR capabilities)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    tesseract-ocr \
    tesseract-ocr-eng \
    libmupdf-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies first for caching layers
COPY server/requirements.txt /app/server/requirements.txt
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r /app/server/requirements.txt

# Copy application code (both app/ RAG engine and server/ API layer)
COPY app /app/app
COPY server /app/server

# Expose container application port
EXPOSE 5001

# Run Uvicorn pointing to server.main:app
CMD ["sh", "-c", "uvicorn server.main:app --host 0.0.0.0 --port ${PORT:-5001}"]
