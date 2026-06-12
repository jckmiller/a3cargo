#!/bin/bash
# =============================================================
# Step 7: Create a User Account
# Run this script on your VPS as root (or with sudo)
# Usage: sudo bash 07_create_user.sh <username> <password> [editor|viewer]
#
# Examples:
#   sudo bash 07_create_user.sh alice MyPassword123 editor
#   sudo bash 07_create_user.sh bob  ViewOnly456    viewer
# =============================================================

set -e

ENV_FILE="/etc/a3cargo-api.env"
API_URL="http://127.0.0.1:3001"

# ── Parse args ────────────────────────────────────────────────────────────────
USERNAME="$1"
PASSWORD="$2"
ROLE="${3:-viewer}"

if [ -z "$USERNAME" ] || [ -z "$PASSWORD" ]; then
  echo ""
  echo "Usage: $0 <username> <password> [editor|viewer]"
  echo ""
  echo "Examples:"
  echo "  $0 alice MyPassword123 editor"
  echo "  $0 bob   ViewOnly456   viewer"
  echo ""
  exit 1
fi

if [[ "$ROLE" != "editor" && "$ROLE" != "viewer" ]]; then
  echo "ERROR: role must be 'editor' or 'viewer' (got: $ROLE)"
  exit 1
fi

# ── Read ADMIN_KEY from env file ──────────────────────────────────────────────
if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: Environment file not found at $ENV_FILE"
  echo "  Have you run 05_setup_api.sh first?"
  exit 1
fi

# Source the env file to pick up ADMIN_KEY
set -a
# shellcheck source=/dev/null
source "$ENV_FILE"
set +a

if [ -z "$ADMIN_KEY" ]; then
  echo "ERROR: ADMIN_KEY not found in $ENV_FILE"
  exit 1
fi

# ── Check API is reachable ────────────────────────────────────────────────────
echo "Checking API health..."
HEALTH=$(curl -sf "${API_URL}/api/health" 2>&1 || echo "fail")
if ! echo "$HEALTH" | grep -q '"ok"'; then
  echo "ERROR: API is not responding at ${API_URL}"
  echo "  Make sure the a3cargo-api service is running:"
  echo "    systemctl status a3cargo-api"
  exit 1
fi

# ── Create the user via REST ──────────────────────────────────────────────────
echo "Creating user '${USERNAME}' with role '${ROLE}'..."

HTTP_STATUS=$(curl -s -o /tmp/a3cargo_register_response.json -w "%{http_code}" \
  -X POST "${API_URL}/api/register" \
  -H "Content-Type: application/json" \
  -H "X-Admin-Key: ${ADMIN_KEY}" \
  -d "{\"username\":\"${USERNAME}\",\"password\":\"${PASSWORD}\",\"role\":\"${ROLE}\"}")

BODY=$(cat /tmp/a3cargo_register_response.json)

if [ "$HTTP_STATUS" = "201" ]; then
  echo ""
  echo "======================================"
  echo " User created successfully!"
  echo ""
  echo " URL:      https://cargo.neoaiaeon.com"
  echo " Username: ${USERNAME}"
  echo " Password: (as provided)"
  echo " Role:     ${ROLE}"
  echo "======================================"
elif [ "$HTTP_STATUS" = "409" ]; then
  echo "ERROR: Username '${USERNAME}' is already taken."
  exit 1
elif [ "$HTTP_STATUS" = "403" ]; then
  echo "ERROR: Admin key was rejected. Check ADMIN_KEY in ${ENV_FILE}."
  exit 1
else
  echo "ERROR: Unexpected response (HTTP ${HTTP_STATUS}):"
  echo "$BODY"
  exit 1
fi
