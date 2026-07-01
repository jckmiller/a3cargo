# A3 Cargo — Deployment Guide (Traefik / Docker Compose)

Deploy the app to **https://a3cargo.jckmiller.com** behind your existing Traefik instance.

---

## Architecture

```
Internet :443
     │
  [Traefik — host network, letsencrypt HTTP-01]
     │  routes Host: a3cargo.jckmiller.com
     │
  [web container — nginx on bridge IP:80]
     │  internal proxy /api → api:3001
     │
  [api container — Node.js/Express/SQLite]
     │
  [named volume: a3cargo_data → /data/a3cargo.db]
```

Both containers run on the compose default bridge network (`a3cargo_default`).  
Traefik (host-mode) reaches the `web` container via its bridge IP on port 80.  
The `api` container is **not** exposed to Traefik — only `web` talks to it.

---

## Prerequisites

- DNS A record for `a3cargo.jckmiller.com` already points at this server ✓  
- Traefik container `traefik-me0z-traefik-1` is running with `letsencrypt` resolver ✓  

---

## First-time Deployment

```bash
# 1. Clone the repo (public — no SSH key needed)
git clone https://github.com/jckmiller/a3cargo.git /opt/a3cargo
cd /opt/a3cargo

# 2. Generate secrets and write .env
printf 'JWT_SECRET=%s\nADMIN_KEY=%s\n' \
  "$(openssl rand -hex 32)" \
  "$(openssl rand -hex 16)" > .env

# 3. Build images and start
docker compose up -d --build

# 4. Watch the logs (Ctrl-C to stop watching)
docker compose logs -f
```

That's it. Traefik will obtain the Let's Encrypt certificate automatically on the first request (HTTP-01 challenge). Visit **https://a3cargo.jckmiller.com** once the containers are up.

**Default login:** `admin` / `123123`  
⚠️ **Change the password immediately** via Settings → User Management in the app.

---

## Creating Additional Users

Once logged in as admin, use the in-app **User Management** panel  
(Settings tab → User Management) to create users with `editor` or `viewer` roles.

Or via the API directly:

```bash
# Read the ADMIN_KEY you generated
ADMIN_KEY=$(grep ADMIN_KEY /opt/a3cargo/.env | cut -d= -f2)

curl -s -X POST https://a3cargo.jckmiller.com/api/register \
  -H "Content-Type: application/json" \
  -H "X-Admin-Key: $ADMIN_KEY" \
  -d '{"username":"alice","password":"SecurePass1","role":"editor"}' | jq
```

Valid roles: `editor` (can save/load projects) · `viewer` (read-only)

---

## Updating the App

Whenever you push new code to GitHub, SSH into the VPS and run:

```bash
cd /opt/a3cargo
git pull   # HTTPS, no auth needed (public repo)
docker compose up -d --build
```

---

## Useful Commands

```bash
# Container status
docker compose -f /opt/a3cargo/docker-compose.yml ps

# Live logs
docker compose -f /opt/a3cargo/docker-compose.yml logs -f

# Restart everything
docker compose -f /opt/a3cargo/docker-compose.yml restart

# SQLite shell (inspect data)
docker compose -f /opt/a3cargo/docker-compose.yml exec api \
  sqlite3 /data/a3cargo.db

# View Traefik routing
docker inspect traefik-me0z-traefik-1 | grep -i a3cargo
```

---

## Troubleshooting

**Site returns 404 / Bad Gateway immediately after first deploy**  
Wait ~30 seconds — Traefik needs one incoming request to trigger the ACME challenge and issue the cert.

**`web` container starts but API calls return errors**  
```bash
docker compose logs api
```
Check that `.env` has valid `JWT_SECRET` and `ADMIN_KEY` values.

**`better-sqlite3` build error during `api` image build**  
The `api/Dockerfile` installs `python3 make g++` for native addon compilation.  
If it still fails, check the build output: `docker compose build api`.

**Check Traefik sees the container**  
The Traefik dashboard (if enabled) or `docker inspect <web-container-id> | grep traefik` will show the labels.

---

## Legacy Scripts

The `deploy/01_vps_setup.sh` through `deploy/07_create_user.sh` scripts describe an older  
**host nginx + certbot + systemd** deployment model that conflicts with Traefik.  
They are kept for reference only — **do not run them on a Traefik server.**
