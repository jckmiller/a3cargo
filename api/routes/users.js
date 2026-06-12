'use strict';

/**
 * User Management Routes (admin-only)
 *
 * GET    /api/users          — list all users
 * POST   /api/users          — create a new user
 * PATCH  /api/users/:id/role — change a user's role
 * DELETE /api/users/:id      — delete a user
 *
 * All routes require a valid JWT with role === 'admin'.
 */

const router = require('express').Router();
const bcrypt = require('bcryptjs');

const { stmts }                              = require('../db');
const { requireAuth, requireAdmin }          = require('../middleware/auth');

const SALT_ROUNDS = 12;

// Every route in this file requires authentication + admin role
router.use(requireAuth, requireAdmin);

// ── GET /api/users ────────────────────────────────────────────────────────────
router.get('/', (_req, res) => {
  const users = stmts.listUsers.all();
  return res.json(users);
});

// ── POST /api/users ───────────────────────────────────────────────────────────
router.post('/', (req, res) => {
  const { username, password, role = 'viewer' } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }
  if (!['admin', 'editor', 'viewer'].includes(role)) {
    return res.status(400).json({ error: 'role must be "admin", "editor", or "viewer"' });
  }

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

// ── PATCH /api/users/:id/role ─────────────────────────────────────────────────
router.patch('/:id/role', (req, res) => {
  const id   = parseInt(req.params.id, 10);
  const { role } = req.body || {};

  if (!['admin', 'editor', 'viewer'].includes(role)) {
    return res.status(400).json({ error: 'role must be "admin", "editor", or "viewer"' });
  }

  const user = stmts.findById.get(id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  stmts.updateRole.run(role, id);
  return res.json({ id, username: user.username, role });
});

// ── DELETE /api/users/:id ─────────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);

  // Prevent self-deletion
  if (id === req.user.id) {
    return res.status(400).json({ error: 'You cannot delete your own account' });
  }

  const user = stmts.findById.get(id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  stmts.deleteUser.run(id);
  return res.json({ success: true });
});

module.exports = router;
