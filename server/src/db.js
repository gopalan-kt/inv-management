import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
export const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'inventory.db');
const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

/**
 * Open (and create if needed) the SQLite database.
 * @param {string} [dbPath] - override the database file (e.g. ':memory:' for tests)
 */
export function openDb(dbPath = DB_PATH) {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Startup assertions — SQLite defaults foreign_keys OFF per connection, and WAL
  // only applies to file databases.
  if (dbPath !== ':memory:' && db.pragma('journal_mode', { simple: true }) !== 'wal') {
    throw new Error('Failed to enable WAL journal mode');
  }
  if (db.pragma('foreign_keys', { simple: true }) !== 1) {
    throw new Error('Failed to enable foreign key enforcement');
  }

  migrate(db);
  return db;
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name       TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `);

  const applied = new Set(
    db.prepare('SELECT name FROM _migrations').all().map((row) => row.name)
  );

  const files = fs.existsSync(MIGRATIONS_DIR)
    ? fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()
    : [];

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(file);
    })();
    console.log(`Applied migration ${file}`);
  }
}
