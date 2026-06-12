#!/bin/bash
# =============================================================
# Step 4: Add Login Protection via nginx Basic Auth
# Run this script on your VPS as root (or with sudo)
# Usage: sudo bash 04_add_auth.sh
# =============================================================

set -e

DOMAIN="cargo.neoaiaeon.com"
HTPASSWD_FILE="/etc/nginx/.htpasswd"
NGINX_CONF="/etc/nginx/sites-available/${DOMAIN}"

echo "======================================"
echo " A3 Cargo - Enable Login Protection"
echo "======================================"

# Install apache2-utils for htpasswd tool (if not already installed)
echo "[1/3] Ensuring htpasswd tool is available..."
apt-get install -y apache2-utils -q

# Create the .htpasswd file with user:123123
echo "[2/3] Creating credentials file..."
# -c = create file, -b = batch mode (password from command line)
htpasswd -cb "$HTPASSWD_FILE" user '123123'
chmod 640 "$HTPASSWD_FILE"
echo "Credentials saved to $HTPASSWD_FILE"

# Update nginx config to require auth
echo "[3/3] Updating nginx config to require login..."

# Check if auth_basic is already configured
if grep -q "auth_basic" "$NGINX_CONF"; then
    echo "Auth already configured in nginx, skipping."
else
    # Insert auth_basic directives into the location / block
    sed -i '/location \/ {/a\        auth_basic "A3 Cargo";\n        auth_basic_user_file /etc/nginx/.htpasswd;' "$NGINX_CONF"
    echo "Auth directives added to nginx config."
fi

# Test and reload nginx
nginx -t
systemctl reload nginx

echo ""
echo "======================================"
echo " Done! Login protection is now active."
echo ""
echo " URL:      https://${DOMAIN}"
echo " Username: user"
echo " Password: 123123"
echo "======================================"
