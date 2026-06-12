'use strict';

/**
 * JWT Authentication Middleware
 *
 * Verifies the Bearer token in the Authorization header and attaches
 * the decoded user payload to req.user.
 *
 * Usage:
 *   router.get('/protected', requireAuth, handler)
 *   router.post('/editor-only', requireAuth, requireEditor, handler)
 */

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';

/**
 * Middleware: verify JWT and populate req.user.
 * Returns 401 if token is missing or invalid.
 */
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload; // { id, username, role }
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Middleware: ensure the authenticated user has the 'editor' role.
 * Must be used AFTER requireAuth.
 * Returns 403 if the user is a viewer.
 */
function requireEditor(req, res, next) {
  if (req.user && req.user.role === 'editor') {
    return next();
  }
  return res.status(403).json({ error: 'Editor role required' });
}

module.exports = { requireAuth, requireEditor, JWT_SECRET };
