#!/bin/bash
# =============================================================
# Future Updates: Pull latest code and rebuild the container
# Run this on your VPS whenever you push new code to GitHub
# Usage: sudo bash update.sh
# =============================================================

set -e

APP_DIR="/opt/a3cargo"
API_SRC="${APP_DIR}/api"
API_DIR="/opt/a3cargo-api"
SERVICE_NAME="a3cargo-api"
CONTAINER_NAME="a3cargo"
IMAGE_NAME="a3cargo:latest"
HOST_PORT=8080

echo "======================================"
echo " A3 Cargo - Update Deployment"
echo "======================================"

echo "[1/5] Pulling latest code from GitHub..."
cd "$APP_DIR"
git pull origin main

echo "[2/5] Updating API service files..."
rsync -a --delete \
  --exclude="node_modules" \
  --exclude="data" \
  "${API_SRC}/" "${API_DIR}/"

echo "  Installing/updating npm dependencies..."
cd "$API_DIR"
npm install --omit=dev --silent

echo "  Restarting ${SERVICE_NAME} systemd service..."
systemctl restart "$SERVICE_NAME"
sleep 1
if systemctl is-active --quiet "$SERVICE_NAME"; then
  echo "  API service restarted successfully."
else
  echo "  ERROR: API service failed to restart. Check logs:"
  echo "    journalctl -u ${SERVICE_NAME} -n 30 --no-pager"
  exit 1
fi

echo "[3/5] Stopping and removing old frontend container..."
docker stop "$CONTAINER_NAME" || true
docker rm "$CONTAINER_NAME" || true

echo "[4/5] Rebuilding Docker image..."
docker build -t "$IMAGE_NAME" "$APP_DIR"

echo "[5/5] Starting updated container..."
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
