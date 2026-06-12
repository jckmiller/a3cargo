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

const path = require('path');
const fs   = require('fs');
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
                          CHECK(role IN ('editor', 'viewer')),
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS projects (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT    NOT NULL,
    data        TEXT    NOT NULL,   -- JSON blob: SavedLoad format
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );
`);

// ── Prepared statements ───────────────────────────────────────────────────────

const stmts = {
  // Users
  createUser:    db.prepare(`INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)`),
  findByUsername:db.prepare(`SELECT * FROM users WHERE username = ?`),
  findById:      db.prepare(`SELECT id, username, role, created_at FROM users WHERE id = ?`),
  listUsers:     db.prepare(`SELECT id, username, role, created_at FROM users ORDER BY id`),
  deleteUser:    db.prepare(`DELETE FROM users WHERE id = ?`),
  updateRole:    db.prepare(`UPDATE users SET role = ? WHERE id = ?`),

  // Projects
  createProject: db.prepare(`
    INSERT INTO projects (owner_id, name, data)
    VALUES (?, ?, ?)
  `),
  listProjects:  db.prepare(`
    SELECT p.id, p.owner_id, p.name, p.created_at, p.updated_at,
           u.username AS owner_name
    FROM   projects p
    JOIN   users    u ON u.id = p.owner_id
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
  deleteProject: db.prepare(`DELETE FROM projects WHERE id = ?`),
};

module.exports = { db, stmts };
