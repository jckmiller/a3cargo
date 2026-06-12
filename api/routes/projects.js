'use strict';

/**
 * Projects Routes
 *
 * GET    /api/projects              — list projects (role-filtered)
 * POST   /api/projects              — create project (editor only)
 * GET    /api/projects/:id          — get a single project (access-checked)
 * PUT    /api/projects/:id          — update project (editor only)
 * DELETE /api/projects/:id          — delete project (editor only)
 * GET    /api/projects/:id/viewers  — list viewer grants (admin only)
 * PUT    /api/projects/:id/viewers  — replace viewer grants (admin only)
 */

const router = require('express').Router();

const { stmts }                           = require('../db');
const { requireAuth, requireEditor, requireAdmin } = require('../middleware/auth');

// ── GET /api/projects ─────────────────────────────────────────────────────────
router.get('/', requireAuth, (req, res) => {
  let rows;
  if (req.user.role === 'viewer') {
    // Viewers only see public projects + ones they've been explicitly granted
    rows = stmts.listProjectsForViewer.all(req.user.id);
  } else {
    // Admins and editors see everything
    rows = stmts.listProjects.all();
  }

  const list = rows.map(({ id, owner_id, owner_name, name, visibility, created_at, updated_at }) => ({
    id, owner_id, owner_name, name, visibility, created_at, updated_at,
  }));
  return res.json(list);
});

// ── POST /api/projects ────────────────────────────────────────────────────────
router.post('/', requireAuth, requireEditor, (req, res) => {
  const { name, data, visibility = 'public' } = req.body || {};

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }
  if (!data) {
    return res.status(400).json({ error: 'data is required' });
  }
  if (!['public', 'restricted'].includes(visibility)) {
    return res.status(400).json({ error: 'visibility must be "public" or "restricted"' });
  }

  const dataStr = typeof data === 'string' ? data : JSON.stringify(data);

  const info = stmts.createProject.run(req.user.id, name.trim(), dataStr, visibility);
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

  // Viewers must have access
  if (req.user.role === 'viewer') {
    if (project.visibility !== 'public') {
      const grant = stmts.viewerCanAccess.get(project.id, req.user.id);
      if (!grant) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }
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

  const { name, data, visibility } = req.body || {};
  const newName = (name && name.trim()) ? name.trim() : existing.name;
  const newData = data
    ? (typeof data === 'string' ? data : JSON.stringify(data))
    : existing.data;

  stmts.updateProject.run(newName, newData, id);

  if (visibility && ['public', 'restricted'].includes(visibility)) {
    stmts.updateProjectVisibility.run(visibility, id);
  }

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

// ── GET /api/projects/:id/viewers ─────────────────────────────────────────────
router.get('/:id/viewers', requireAuth, requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!stmts.getProject.get(id)) {
    return res.status(404).json({ error: 'Project not found' });
  }
  const viewers = stmts.listProjectViewers.all(id);
  return res.json(viewers);
});

// ── PUT /api/projects/:id/viewers ─────────────────────────────────────────────
// Replaces the full viewer grant list for a project.
// Body: { userIds: number[] }
router.put('/:id/viewers', requireAuth, requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!stmts.getProject.get(id)) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const { userIds } = req.body || {};
  if (!Array.isArray(userIds)) {
    return res.status(400).json({ error: 'userIds must be an array' });
  }

  // Replace in one transaction
  const replaceViewers = require('../db').db.transaction((projId, ids) => {
    stmts.clearProjectViewers.run(projId);
    for (const uid of ids) {
      stmts.addProjectViewer.run(projId, uid);
    }
  });

  replaceViewers(id, userIds);

  const viewers = stmts.listProjectViewers.all(id);
  return res.json(viewers);
});

module.exports = router;
