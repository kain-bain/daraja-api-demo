const { DatabaseSync } = require("node:sqlite");
const fs = require("fs");
const path = require("path");

const DEFAULT_DB_PATH = path.join(__dirname, "data", "payments.db");

/**
 * Open (and lazily initialise) the SQLite database.
 * Uses Node's built-in node:sqlite so there is no native dependency to build
 * on hosts like Render.
 */
function initDb(dbPath = process.env.DATABASE_PATH || DEFAULT_DB_PATH) {
  if (dbPath !== ":memory:") {
    fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
  }

  const db = new DatabaseSync(dbPath);

  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");

  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      reference  TEXT NOT NULL UNIQUE,
      phone      TEXT NOT NULL,
      amount     INTEGER NOT NULL,
      status     TEXT NOT NULL DEFAULT 'PENDING',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS payments (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id            INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      checkout_request_id TEXT UNIQUE,
      merchant_request_id TEXT,
      status              TEXT NOT NULL DEFAULT 'WAITING',
      result_code         INTEGER,
      result_desc         TEXT,
      receipt             TEXT,
      raw_callback        TEXT,
      created_at          TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_payments_order
      ON payments(order_id);
  `);

  return db;
}

module.exports = { initDb, DEFAULT_DB_PATH };
