#!/bin/bash
# =============================================================
# Step 3: Configure Nginx Reverse Proxy + SSL (Let's Encrypt)
# Run this script on your VPS as root (or with sudo)
# Usage: sudo bash 03_configure_nginx.sh
#
# IMPORTANT: DNS for cargo.neoaiaeon.com must already be
# pointing to this server's IP before running this script.
# =============================================================

set -e

DOMAIN="cargo.neoaiaeon.com"
EMAIL="admin@neoaiaeon.com"   # <-- Change this to your real email for SSL cert notices
HOST_PORT=8080

echo "======================================"
echo " A3 Cargo - Nginx + SSL Setup"
echo "======================================"

# Write nginx config for the domain
echo "[1/3] Writing nginx config for ${DOMAIN}..."
cat > /etc/nginx/sites-available/${DOMAIN} << EOF
server {
    listen 80;
    server_name ${DOMAIN};

    location / {
        proxy_pass http://127.0.0.1:${HOST_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

# Enable the site
ln -sf /etc/nginx/sites-available/${DOMAIN} /etc/nginx/sites-enabled/${DOMAIN}

# Remove default nginx site if it exists
if [ -f /etc/nginx/sites-enabled/default ]; then
    rm /etc/nginx/sites-enabled/default
    echo "Removed default nginx site."
fi

# Test nginx config
nginx -t
echo "Nginx config is valid."

# Reload nginx
systemctl reload nginx
echo "Nginx reloaded."

# Obtain SSL certificate via Certbot
echo "[2/3] Obtaining SSL certificate from Let's Encrypt..."
echo "      (Domain must already be pointing to this server)"
certbot --nginx \
    -d ${DOMAIN} \
    --non-interactive \
    --agree-tos \
    --email ${EMAIL} \
    --redirect

echo "[3/3] Verifying certificate auto-renewal..."
systemctl enable certbot.timer 2>/dev/null || true
# Test renewal dry run
certbot renew --dry-run

echo ""
echo "======================================"
echo " Done! Your app is now live at:"
echo " https://${DOMAIN}"
echo ""
echo " SSL cert auto-renews every 90 days."
echo "======================================"
