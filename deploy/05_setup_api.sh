#!/bin/bash
# =============================================================
# Step 5: Install & Start the A3 Cargo API (Node.js + systemd)
# Run this script on your VPS as root (or with sudo)
# Usage: sudo bash 05_setup_api.sh
# =============================================================

set -e

APP_DIR="/opt/a3cargo"
API_SRC="${APP_DIR}/api"
API_DIR="/opt/a3cargo-api"
SERVICE_NAME="a3cargo-api"
ENV_FILE="/etc/a3cargo-api.env"
DATA_DIR="/var/lib/a3cargo"
NODE_PORT=3001

echo "======================================"
echo " A3 Cargo - API Setup"
echo "======================================"

# ── 1. Install Node.js (LTS) if not already present ───────────────────────────
if ! command -v node &>/dev/null; then
  echo "[1/5] Installing Node.js LTS..."
  curl -fsSL https://deb.nodesource.com/setup_lts.x | bash -
  apt-get install -y nodejs
else
  echo "[1/5] Node.js already installed: $(node -v)"
fi

# ── 2. Copy API source files ──────────────────────────────────────────────────
echo "[2/5] Copying API files to ${API_DIR}..."
mkdir -p "$API_DIR"

# Copy api directory contents (rsync keeps it idempotent)
rsync -a --delete \
  --exclude="node_modules" \
  --exclude="data" \
  "${API_SRC}/" "${API_DIR}/"

# Install Node dependencies
echo "  Installing npm dependencies..."
cd "$API_DIR"
npm install --omit=dev --silent

# ── 3. Create data directory & environment file ───────────────────────────────
echo "[3/5] Setting up data directory and env file..."
mkdir -p "$DATA_DIR"
chown -R www-data:www-data "$DATA_DIR" 2>/dev/null || true

if [ ! -f "$ENV_FILE" ]; then
  # Generate random secrets
  JWT_SECRET=$(openssl rand -hex 32)
  ADMIN_KEY=$(openssl rand -hex 16)

  cat > "$ENV_FILE" << ENVEOF
# A3 Cargo API — environment variables
# Edit this file to change secrets. Restart the service after changes:
#   systemctl restart ${SERVICE_NAME}

PORT=${NODE_PORT}
DATA_DIR=${DATA_DIR}

# REQUIRED: Change these if you regenerate them
JWT_SECRET=${JWT_SECRET}
ADMIN_KEY=${ADMIN_KEY}
ENVEOF

  chmod 600 "$ENV_FILE"
  echo "  Environment file created at ${ENV_FILE}"
  echo ""
  echo "  ┌─────────────────────────────────────────────┐"
  echo "  │  IMPORTANT — save these somewhere safe!     │"
  echo "  │                                             │"
  echo "  │  ADMIN_KEY: ${ADMIN_KEY}  │"
  echo "  │  (needed to create users via 07_create_user.sh)"
  echo "  └─────────────────────────────────────────────┘"
  echo ""
else
  echo "  Env file already exists at ${ENV_FILE}, skipping secret generation."
fi

# ── 4. Create systemd service ─────────────────────────────────────────────────
echo "[4/5] Creating systemd service..."
cat > "/etc/systemd/system/${SERVICE_NAME}.service" << EOF
[Unit]
Description=A3 Cargo API
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=${API_DIR}
EnvironmentFile=${ENV_FILE}
ExecStart=/usr/bin/node ${API_DIR}/server.js
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=${SERVICE_NAME}

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl restart "$SERVICE_NAME"

sleep 1
if systemctl is-active --quiet "$SERVICE_NAME"; then
  echo "  Service started successfully."
else
  echo "  ERROR: Service failed to start. Check logs with:"
  echo "    journalctl -u ${SERVICE_NAME} -n 50 --no-pager"
  exit 1
fi

# ── 5. Verify API is responding ───────────────────────────────────────────────
echo "[5/5] Verifying API health..."
sleep 1
HEALTH=$(curl -sf "http://127.0.0.1:${NODE_PORT}/api/health" || echo "fail")
if echo "$HEALTH" | grep -q '"ok"'; then
  echo "  API health check passed: ${HEALTH}"
else
  echo "  WARNING: Health check did not return expected response."
  echo "  Response: ${HEALTH}"
  echo "  Check logs: journalctl -u ${SERVICE_NAME} -n 20 --no-pager"
fi

echo ""
echo "======================================"
echo " Done! API is running on port ${NODE_PORT}"
echo ""
echo " Next steps:"
echo "  1. Run 06_update_nginx_api.sh to proxy /api/ requests"
echo "  2. Run 07_create_user.sh to create your first user"
echo "======================================"
