'use strict';

/**
 * A3 Cargo API Server
 *
 * Express application that provides:
 *   - User management (register / login / JWT auth)
 *   - Project CRUD (saved container loads)
 *   - Role-based access ('editor' can write; 'viewer' can read)
 *
 * Environment variables:
 *   PORT        — TCP port to listen on         (default: 3001)
 *   JWT_SECRET  — Secret key for JWT signing    (REQUIRED in production)
 *   ADMIN_KEY   — Header key for user creation  (REQUIRED in production)
 *   DATA_DIR    — Directory for the SQLite file (default: ./data)
 */

const express = require('express');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ─────────────────────────────────────────────────────────────────

app.use(express.json({ limit: '5mb' }));

// CORS — allow the front-end origin (nginx serves the same domain so in
// production this only matters during local development via Vite dev server).
app.use((req, res, next) => {
  const origin = req.headers.origin || '';
  const allowed = [
    'http://localhost:5173',    // Vite dev server
    'http://localhost:4173',    // Vite preview
    'https://cargo.neoaiaeon.com',
  ];
  if (allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Admin-Key');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ── Routes ─────────────────────────────────────────────────────────────────────

app.use('/api', require('./routes/auth'));
app.use('/api/projects', require('./routes/projects'));

// Health-check
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

// 404 fallback for unknown /api/* paths
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

// ── Start ──────────────────────────────────────────────────────────────────────

// Warn if default secrets are in use
if (!process.env.JWT_SECRET) {
  console.warn('[WARN] JWT_SECRET not set — using insecure default. Set it in /etc/a3cargo-api.env');
}
if (!process.env.ADMIN_KEY) {
  console.warn('[WARN] ADMIN_KEY not set — user creation will only work while the DB is empty.');
}

app.listen(PORT, '127.0.0.1', () => {
  console.log(`A3 Cargo API listening on http://127.0.0.1:${PORT}`);
});
