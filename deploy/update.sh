#!/bin/bash
# =============================================================
# Future Updates: Pull latest code and rebuild the container
# Run this on your VPS whenever you push new code to GitHub
# Usage: sudo bash update.sh
# =============================================================

set -e

APP_DIR="/opt/a3cargo"
CONTAINER_NAME="a3cargo"
IMAGE_NAME="a3cargo:latest"
HOST_PORT=8080

echo "======================================"
echo " A3 Cargo - Update Deployment"
echo "======================================"

echo "[1/4] Pulling latest code from GitHub..."
cd "$APP_DIR"
git pull origin main

echo "[2/4] Stopping and removing old container..."
docker stop "$CONTAINER_NAME" || true
docker rm "$CONTAINER_NAME" || true

echo "[3/4] Rebuilding Docker image..."
docker build -t "$IMAGE_NAME" "$APP_DIR"

echo "[4/4] Starting updated container..."
docker run -d \
    --name "$CONTAINER_NAME" \
    --restart unless-stopped \
    -p 127.0.0.1:${HOST_PORT}:80 \
    --add-host=host.docker.internal:host-gateway \
    "$IMAGE_NAME"

# Clean up old unused images
docker image prune -f

echo ""
echo "======================================"
echo " Update complete!"
echo " https://cargo.neoaiaeon.com"
echo "======================================"
