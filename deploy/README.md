# A3 Cargo — VPS Deployment Guide

Deploy the app to your Hostinger Ubuntu VPS at **https://cargo.neoaiaeon.com**

---

## Prerequisites (Do This First)

**Point your DNS to the VPS before running any scripts.**

1. Log in to [Hostinger](https://hpanel.hostinger.com)
2. Navigate to **Domains → neoaiaeon.com → DNS / Nameservers**
3. Add a new DNS record:
   - **Type:** A
   - **Name:** `cargo`
   - **Points to:** `<your VPS IP address>`
   - **TTL:** 3600 (or default)
4. Wait 5–30 minutes for DNS to propagate

---

## Deployment Steps

SSH into your VPS first:
```bash
ssh root@<your-vps-ip>
```

Then run the three scripts in order:

---

### Step 1 — Install Docker, Nginx & Certbot

```bash
curl -O https://raw.githubusercontent.com/jckmiller/a3cargo/main/deploy/01_vps_setup.sh
sudo bash 01_vps_setup.sh
```

This installs:
- Docker (to run the app container)
- Nginx (host-level reverse proxy)
- Certbot (free SSL from Let's Encrypt)
- UFW firewall (opens ports 80, 443, SSH)

---

### Step 2 — Clone Repo & Build the App

```bash
curl -O https://raw.githubusercontent.com/jckmiller/a3cargo/main/deploy/02_deploy_app.sh
sudo bash 02_deploy_app.sh
```

This:
- Clones the GitHub repo to `/opt/a3cargo`
- Builds the Docker image (TypeScript → Vite → nginx)
- Runs the container on internal port `8080`

> ⏱ The build takes 1–3 minutes the first time.

---

### Step 3 — Configure Nginx + SSL

> ⚠️ **DNS must be propagated before this step**, or the SSL cert will fail.

```bash
curl -O https://raw.githubusercontent.com/jckmiller/a3cargo/main/deploy/03_configure_nginx.sh
```

**Edit the email address** in the script before running:
```bash
nano 03_configure_nginx.sh
# Change: EMAIL="admin@neoaiaeon.com"
# To your actual email address
```

Then run it:
```bash
sudo bash 03_configure_nginx.sh
```

This:
- Creates an nginx reverse proxy config for `cargo.neoaiaeon.com`
- Gets a free SSL certificate from Let's Encrypt
- Enables auto-redirect from HTTP → HTTPS
- Sets up automatic cert renewal

---

### Step 4 — Add Basic Auth *(optional, pre-API)*

```bash
curl -O https://raw.githubusercontent.com/jckmiller/a3cargo/main/deploy/04_add_auth.sh
sudo bash 04_add_auth.sh
```

This:
- Creates an nginx `.htpasswd` credentials file
- Protects the site with HTTP Basic Auth (browser login prompt)
- Credentials: **username:** `user` / **password:** `123123`

> **Note:** This is a temporary gate. Once you complete Steps 5–7 to set up the API and JWT authentication, Step 6 will remove the Basic Auth in favour of the app's own login system.

---

### Step 5 — Install & Start the API

```bash
curl -O https://raw.githubusercontent.com/jckmiller/a3cargo/main/deploy/05_setup_api.sh
sudo bash 05_setup_api.sh
```

This:
- Installs Node.js LTS (if not already present)
- Copies the `api/` source to `/opt/a3cargo-api` and runs `npm install`
- Creates `/var/lib/a3cargo` as the SQLite data directory
- Generates random `JWT_SECRET` and `ADMIN_KEY` values and writes them to `/etc/a3cargo-api.env`
- Registers and starts a **systemd service** called `a3cargo-api` (auto-restarts on failure, survives reboots)
- Verifies the API is responding via a health-check to `GET /api/health`

> ⚠️ **Save the `ADMIN_KEY` printed at the end** — you will need it in Step 7.

---

### Step 6 — Update Nginx to Proxy the API

```bash
curl -O https://raw.githubusercontent.com/jckmiller/a3cargo/main/deploy/06_update_nginx_api.sh
sudo bash 06_update_nginx_api.sh
```

This:
- Backs up the existing nginx config
- Rewrites the nginx server block to proxy `/api/*` to the Node.js API on port `3001`
- Removes the HTTP Basic Auth protection (replaced by JWT in the app)
- Reloads nginx

---

### Step 7 — Create Your First User

```bash
curl -O https://raw.githubusercontent.com/jckmiller/a3cargo/main/deploy/07_create_user.sh
sudo bash 07_create_user.sh <username> <password> editor
```

Examples:
```bash
sudo bash 07_create_user.sh alice MyPassword123 editor
sudo bash 07_create_user.sh bob  ViewOnly456    viewer
```

This posts to `POST /api/register` with the `ADMIN_KEY` from `/etc/a3cargo-api.env` to create the specified user.
Valid roles: `editor` (can save/load projects) or `viewer` (read-only).

> **Note:** A default `admin` account (`admin` / `123123`) is seeded automatically on first startup. Change its password via the **User Management** panel in the app (Settings tab → User Management) after logging in.

---

### ✅ Done!

Visit **https://cargo.neoaiaeon.com** — your app should be live with full JWT authentication.

---

## Updating the App in the Future

Whenever you push new code to GitHub, SSH into the VPS and run:

```bash
sudo bash /opt/a3cargo/deploy/update.sh
```

Or fetch the latest version:
```bash
curl -O https://raw.githubusercontent.com/jckmiller/a3cargo/main/deploy/update.sh
sudo bash update.sh
```

This pulls the latest code, rebuilds the Docker image, and restarts the container with zero config changes needed.

---

## Troubleshooting

**Check if the container is running:**
```bash
docker ps
```

**View container logs:**
```bash
docker logs a3cargo
```

**Check nginx status:**
```bash
systemctl status nginx
nginx -t
```

**Test SSL certificate:**
```bash
certbot certificates
```

**Manually renew SSL:**
```bash
certbot renew
```

**Restart everything:**
```bash
docker restart a3cargo
systemctl restart nginx
```

---

## Architecture

```
Internet (HTTPS :443)
        │
   [Nginx on host]         ← Terminates SSL, handles domain
        │
   [Docker container]      ← nginx inside container serves static files
   127.0.0.1:8080         ← Only accessible from localhost
        │
   Built Vite/TS app       ← /usr/share/nginx/html inside container
```
