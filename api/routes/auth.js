'use strict';

/**
 * Auth Routes
 *
 * POST /api/register  — create a new user (requires ADMIN_KEY header or no users exist yet)
 * POST /api/login     — exchange credentials for a JWT
 * GET  /api/me        — return current user info (requires JWT)
 */

const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');

const { stmts }                    = require('../db');
const { requireAuth, JWT_SECRET }  = require('../middleware/auth');

const SALT_ROUNDS  = 12;
const TOKEN_EXPIRY = '7d';

// ── POST /api/register ────────────────────────────────────────────────────────
/**
 * Create a new user account.
 *
 * Body: { username, password, role? }
 *
 * Security rules:
 *   - If NO users exist yet, the first registration is allowed freely
 *     (bootstrapping the first admin/editor).
 *   - Otherwise the request must include the header:
 *       X-Admin-Key: <value of ADMIN_KEY env var>
 *     This keeps user creation server-side and avoids an open registration page.
 */
router.post('/register', (req, res) => {
  const { username, password, role = 'viewer' } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }
  if (!['editor', 'viewer'].includes(role)) {
    return res.status(400).json({ error: 'role must be "editor" or "viewer"' });
  }

  // Allow first-time bootstrap OR require admin key
  const existingUsers = stmts.listUsers.all();
  if (existingUsers.length > 0) {
    const adminKey = process.env.ADMIN_KEY || '';
    if (!adminKey || req.headers['x-admin-key'] !== adminKey) {
      return res.status(403).json({ error: 'Admin key required to create users' });
    }
  }

  // Check uniqueness
  if (stmts.findByUsername.get(username)) {
    return res.status(409).json({ error: 'Username already taken' });
  }

  const hash = bcrypt.hashSync(password, SALT_ROUNDS);
  const info = stmts.createUser.run(username, hash, role);

  return res.status(201).json({
    id: info.lastInsertRowid,
    username,
    role,
  });
});

// ── POST /api/login ───────────────────────────────────────────────────────────
/**
 * Authenticate and return a signed JWT.
 * Body: { username, password }
 */
router.post('/login', (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }

  const user = stmts.findByUsername.get(username);
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );

  return res.json({
    token,
    user: { id: user.id, username: user.username, role: user.role },
  });
});

// ── GET /api/me ───────────────────────────────────────────────────────────────
/**
 * Return the currently authenticated user.
 * The token payload is refreshed from the DB to pick up any role changes.
 */
router.get('/me', requireAuth, (req, res) => {
  const user = stmts.findById.get(req.user.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  return res.json(user);
});

module.exports = router;
