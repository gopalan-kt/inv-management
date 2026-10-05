import crypto from 'node:crypto';
import { httpError } from '../errors.js';

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), candidate);
}

export function createUser(db, { orgId, name = '', email, password, role = 'owner' }) {
  const emailNorm = String(email).trim().toLowerCase();
  const exists = db.prepare('SELECT 1 FROM users WHERE email = ?').get(emailNorm);
  if (exists) throw httpError(409, 'EMAIL_TAKEN', 'An account with this email already exists');

  const id = db
    .prepare('INSERT INTO users (org_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)')
    .run(orgId, name, emailNorm, hashPassword(password), role).lastInsertRowid;
  return db.prepare('SELECT id, org_id, name, email, role FROM users WHERE id = ?').get(id);
}

export function login(db, { email, password }) {
  const user = db
    .prepare('SELECT * FROM users WHERE email = ?')
    .get(String(email).trim().toLowerCase());
  if (!user || !verifyPassword(password, user.password_hash)) {
    throw httpError(401, 'INVALID_CREDENTIALS', 'Incorrect email or password');
  }
  const org = db.prepare('SELECT id, name, slug FROM organizations WHERE id = ?').get(user.org_id);
  return {
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    org,
  };
}

/** Register: creates a NEW organization plus its owner account in one shot. */
export function register(db, { orgName, email, password, name = 'Owner' }) {
  const emailNorm = String(email).trim().toLowerCase();
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(emailNorm)) {
    throw httpError(409, 'EMAIL_TAKEN', 'An account with this email already exists');
  }

  const orgNameClean = String(orgName).trim();
  let slug = orgNameClean.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'org';
  let candidate = slug;
  let n = 2;
  while (db.prepare('SELECT 1 FROM organizations WHERE slug = ?').get(candidate)) {
    candidate = `${slug}-${n++}`;
  }

  const create = db.transaction(() => {
    const orgId = db
      .prepare('INSERT INTO organizations (name, slug) VALUES (?, ?)')
      .run(orgNameClean, candidate).lastInsertRowid;
    const userId = db
      .prepare('INSERT INTO users (org_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)')
      .run(orgId, name, emailNorm, hashPassword(password), 'owner').lastInsertRowid;
    return { orgId, userId };
  });
  const { orgId, userId } = create();

  const user = db.prepare('SELECT id, org_id, name, email, role FROM users WHERE id = ?').get(userId);
  const org = db.prepare('SELECT id, name, slug FROM organizations WHERE id = ?').get(orgId);
  return { user, org };
}
