#!/bin/bash
# =============================================================
# Step 1: VPS Initial Setup
# Run this script on your VPS as root (or with sudo)
# Usage: sudo bash 01_vps_setup.sh
# =============================================================

set -e

echo "======================================"
echo " A3 Cargo - VPS Setup Script"
echo "======================================"

# Update system
echo "[1/5] Updating system packages..."
apt-get update -y && apt-get upgrade -y

# Install prerequisites
echo "[2/5] Installing prerequisites..."
apt-get install -y \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    git \
    nginx \
    certbot \
    python3-certbot-nginx \
    ufw

# Install Docker
echo "[3/5] Installing Docker..."
if ! command -v docker &> /dev/null; then
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
      $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
      tee /etc/apt/sources.list.d/docker.list > /dev/null
    apt-get update -y
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    systemctl enable docker
    systemctl start docker
    echo "Docker installed successfully."
else
    echo "Docker already installed, skipping."
fi

# Configure firewall
echo "[4/5] Configuring firewall (UFW)..."
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable
echo "Firewall configured."

# Enable and start nginx
echo "[5/5] Enabling nginx..."
systemctl enable nginx
systemctl start nginx

echo ""
echo "======================================"
echo " Setup complete!"
echo " Next: Run 02_deploy_app.sh"
echo "======================================"
