#!/usr/bin/env node
// Create a user for an existing organization.
//
// Usage:
//   node server/scripts/create-user.js <orgId> <email> <password> [--name "Name"] [--role owner|manager|staff]
//
// Example — the SEL demo credential:
//   node server/scripts/create-user.js 1 owner@sel.com sel1234 --name "SEL Owner" --role owner

import { openDb } from '../src/db.js';
import { createUser } from '../src/services/auth.js';

const args = process.argv.slice(2);
const [orgId, email, password] = args.filter((a) => !a.startsWith('--'));
const nameIdx = args.indexOf('--name');
const roleIdx = args.indexOf('--role');
const name = nameIdx >= 0 ? args[nameIdx + 1] : '';
const role = roleIdx >= 0 ? args[roleIdx + 1] : 'owner';

if (!orgId || !email || !password) {
  console.error('Usage: node server/scripts/create-user.js <orgId> <email> <password> [--name "Name"] [--role owner]');
  process.exit(1);
}

const db = openDb();
if (!db.prepare('SELECT id FROM organizations WHERE id = ?').get(Number(orgId))) {
  console.error(`Error: no organization with id ${orgId}`);
  process.exit(1);
}

try {
  const user = createUser(db, { orgId: Number(orgId), email, password, name, role });
  console.log(`Created ${user.role}: ${user.name || user.email} (org ${user.org_id})`);
} catch (err) {
  const status = err.status ?? 500;
  console.error(`Error (${status}): ${err.message}`);
  process.exit(1);
}
