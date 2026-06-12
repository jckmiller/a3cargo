#!/bin/bash
# =============================================================
# Step 2: Clone Repo & Build/Run Docker Container
# Run this script on your VPS as root (or with sudo)
# Usage: sudo bash 02_deploy_app.sh
# =============================================================

set -e

APP_DIR="/opt/a3cargo"
CONTAINER_NAME="a3cargo"
IMAGE_NAME="a3cargo:latest"
HOST_PORT=8080

echo "======================================"
echo " A3 Cargo - App Deployment Script"
echo "======================================"

# Clone or update the repo
echo "[1/4] Cloning/updating repository..."
if [ -d "$APP_DIR" ]; then
    echo "Directory exists, pulling latest changes..."
    cd "$APP_DIR"
    git pull origin main
else
    git clone https://github.com/jckmiller/a3cargo.git "$APP_DIR"
    cd "$APP_DIR"
fi

# Stop and remove existing container if running
echo "[2/4] Stopping existing container (if any)..."
if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    docker stop "$CONTAINER_NAME" || true
    docker rm "$CONTAINER_NAME" || true
    echo "Old container removed."
else
    echo "No existing container found."
fi

# Build the Docker image
echo "[3/4] Building Docker image (this may take a few minutes)..."
docker build -t "$IMAGE_NAME" "$APP_DIR"
echo "Docker image built successfully."

# Run the container
echo "[4/4] Starting container on port ${HOST_PORT}..."
docker run -d \
    --name "$CONTAINER_NAME" \
    --restart unless-stopped \
    -p 127.0.0.1:${HOST_PORT}:80 \
    "$IMAGE_NAME"

echo ""
echo "======================================"
echo " App is running!"
echo " Container: $CONTAINER_NAME"
echo " Internal URL: http://127.0.0.1:${HOST_PORT}"
echo ""
echo " Next: Run 03_configure_nginx.sh"
echo "======================================"
