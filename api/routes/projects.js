'use strict';

/**
 * Projects Routes
 *
 * GET    /api/projects       — list all saved projects (JWT required)
 * POST   /api/projects       — create project         (editor only)
 * GET    /api/projects/:id   — get a single project   (JWT required)
 * PUT    /api/projects/:id   — update project         (editor only)
 * DELETE /api/projects/:id   — delete project         (editor only)
 */

const router = require('express').Router();

const { stmts }                           = require('../db');
const { requireAuth, requireEditor }      = require('../middleware/auth');

// ── GET /api/projects ─────────────────────────────────────────────────────────
router.get('/', requireAuth, (req, res) => {
  const rows = stmts.listProjects.all();
  // Strip the heavy data blob from the list view
  const list = rows.map(({ id, owner_id, owner_name, name, created_at, updated_at }) => ({
    id, owner_id, owner_name, name, created_at, updated_at,
  }));
  return res.json(list);
});

// ── POST /api/projects ────────────────────────────────────────────────────────
router.post('/', requireAuth, requireEditor, (req, res) => {
  const { name, data } = req.body || {};

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }
  if (!data) {
    return res.status(400).json({ error: 'data is required' });
  }

  // Accept data as object or pre-serialised string
  const dataStr = typeof data === 'string' ? data : JSON.stringify(data);

  const info = stmts.createProject.run(req.user.id, name.trim(), dataStr);
  const project = stmts.getProject.get(info.lastInsertRowid);

  return res.status(201).json({
    ...project,
    data: JSON.parse(project.data),
  });
});

// ── GET /api/projects/:id ─────────────────────────────────────────────────────
router.get('/:id', requireAuth, (req, res) => {
  const project = stmts.getProject.get(Number(req.params.id));
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }
  return res.json({
    ...project,
    data: JSON.parse(project.data),
  });
});

// ── PUT /api/projects/:id ─────────────────────────────────────────────────────
router.put('/:id', requireAuth, requireEditor, (req, res) => {
  const id = Number(req.params.id);
  const existing = stmts.getProject.get(id);
  if (!existing) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const { name, data } = req.body || {};
  const newName = (name && name.trim()) ? name.trim() : existing.name;
  const newData = data
    ? (typeof data === 'string' ? data : JSON.stringify(data))
    : existing.data;

  stmts.updateProject.run(newName, newData, id);
  const updated = stmts.getProject.get(id);

  return res.json({
    ...updated,
    data: JSON.parse(updated.data),
  });
});

// ── DELETE /api/projects/:id ──────────────────────────────────────────────────
router.delete('/:id', requireAuth, requireEditor, (req, res) => {
  const id = Number(req.params.id);
  const existing = stmts.getProject.get(id);
  if (!existing) {
    return res.status(404).json({ error: 'Project not found' });
  }

  stmts.deleteProject.run(id);
  return res.json({ success: true, id });
});

module.exports = router;
