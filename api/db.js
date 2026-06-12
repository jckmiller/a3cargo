'use strict';

/**
 * Database Layer
 *
 * Creates and initialises the SQLite database with the required schema.
 * Tables are created with IF NOT EXISTS so this module is safe to import
 * on every start-up.
 *
 * Database file location: DATA_DIR env-var (default: ./data/a3cargo.db)
 */

const path   = require('path');
const fs     = require('fs');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_FILE  = path.join(DATA_DIR, 'a3cargo.db');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(DB_FILE);

// Enable WAL for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Schema ────────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    UNIQUE NOT NULL,
    password_hash TEXT    NOT NULL,
    role          TEXT    NOT NULL DEFAULT 'viewer'
                          CHECK(role IN ('admin', 'editor', 'viewer')),
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS projects (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT    NOT NULL,
    data        TEXT    NOT NULL,
    visibility  TEXT    NOT NULL DEFAULT 'public'
                        CHECK(visibility IN ('public', 'restricted')),
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS project_viewers (
    project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id     INTEGER NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
    PRIMARY KEY (project_id, user_id)
  );
`);

// ── Prepared statements ───────────────────────────────────────────────────────

const stmts = {
  // Users
  createUser:    db.prepare(`INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)`),
  findByUsername:db.prepare(`SELECT * FROM users WHERE username = ?`),
  findById:      db.prepare(`SELECT id, username, role, created_at FROM users WHERE id = ?`),
  listUsers:     db.prepare(`SELECT id, username, role, created_at FROM users ORDER BY id`),
  listViewers:   db.prepare(`SELECT id, username, role, created_at FROM users WHERE role = 'viewer' ORDER BY id`),
  deleteUser:    db.prepare(`DELETE FROM users WHERE id = ?`),
  updateRole:    db.prepare(`UPDATE users SET role = ? WHERE id = ?`),

  // Projects
  createProject: db.prepare(`
    INSERT INTO projects (owner_id, name, data, visibility)
    VALUES (?, ?, ?, ?)
  `),
  listProjects:  db.prepare(`
    SELECT p.id, p.owner_id, p.name, p.visibility, p.created_at, p.updated_at,
           u.username AS owner_name
    FROM   projects p
    JOIN   users    u ON u.id = p.owner_id
    ORDER  BY p.updated_at DESC
  `),
  listProjectsForViewer: db.prepare(`
    SELECT p.id, p.owner_id, p.name, p.visibility, p.created_at, p.updated_at,
           u.username AS owner_name
    FROM   projects p
    JOIN   users    u ON u.id = p.owner_id
    WHERE  p.visibility = 'public'
       OR  EXISTS (
             SELECT 1 FROM project_viewers pv
             WHERE  pv.project_id = p.id AND pv.user_id = ?
           )
    ORDER  BY p.updated_at DESC
  `),
  getProject:    db.prepare(`
    SELECT p.*, u.username AS owner_name
    FROM   projects p
    JOIN   users    u ON u.id = p.owner_id
    WHERE  p.id = ?
  `),
  updateProject: db.prepare(`
    UPDATE projects
    SET    name = ?, data = ?, updated_at = datetime('now')
    WHERE  id = ?
  `),
  updateProjectVisibility: db.prepare(`
    UPDATE projects SET visibility = ?, updated_at = datetime('now') WHERE id = ?
  `),
  deleteProject: db.prepare(`DELETE FROM projects WHERE id = ?`),

  // Project viewers
  listProjectViewers:  db.prepare(`
    SELECT u.id, u.username, u.role
    FROM   project_viewers pv
    JOIN   users u ON u.id = pv.user_id
    WHERE  pv.project_id = ?
    ORDER  BY u.username
  `),
  addProjectViewer:    db.prepare(`
    INSERT OR IGNORE INTO project_viewers (project_id, user_id) VALUES (?, ?)
  `),
  removeProjectViewer: db.prepare(`
    DELETE FROM project_viewers WHERE project_id = ? AND user_id = ?
  `),
  clearProjectViewers: db.prepare(`
    DELETE FROM project_viewers WHERE project_id = ?
  `),
  viewerCanAccess: db.prepare(`
    SELECT 1 FROM project_viewers WHERE project_id = ? AND user_id = ?
  `),
};

// ── Migration: add 'admin' role support ───────────────────────────────────────
// SQLite CHECK constraints cannot be altered after table creation.
// If the old constraint exists (editor|viewer only), we recreate the table.
(function migrateRoleConstraint() {
  const tableSql = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='users'`).get();
  if (tableSql && !tableSql.sql.includes("'admin'")) {
    console.log('[db] Migrating users table to support admin role...');
    db.exec(`
      PRAGMA foreign_keys = OFF;
      BEGIN;
        CREATE TABLE users_new (
          id            INTEGER PRIMARY KEY AUTOINCREMENT,
          username      TEXT    UNIQUE NOT NULL,
          password_hash TEXT    NOT NULL,
          role          TEXT    NOT NULL DEFAULT 'viewer'
                                CHECK(role IN ('admin', 'editor', 'viewer')),
          created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
        );
        INSERT INTO users_new SELECT * FROM users;
        DROP TABLE users;
        ALTER TABLE users_new RENAME TO users;
      COMMIT;
      PRAGMA foreign_keys = ON;
    `);
    console.log('[db] Migration complete.');
  }
})();

// ── Migration: add visibility column to existing projects table ───────────────
(function migrateProjectVisibility() {
  const tableSql = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='projects'`).get();
  if (tableSql && !tableSql.sql.includes('visibility')) {
    console.log('[db] Migrating projects table to add visibility column...');
    db.exec(`ALTER TABLE projects ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public'`);
    console.log('[db] Migration complete.');
  }
})();

// ── Default seed ──────────────────────────────────────────────────────────────
// On a brand-new installation (empty users table) create a default admin
// account so the app is immediately usable without running any extra scripts.
// Change the password after first login using the User Management UI.

const userCount = db.prepare('SELECT COUNT(*) AS n FROM users').get();
if (userCount.n === 0) {
  const hash = bcrypt.hashSync('123123', 10);
  stmts.createUser.run('admin', hash, 'admin');
  console.log('[db] Seeded default admin account (username: admin / password: 123123)');
}

module.exports = { db, stmts };
