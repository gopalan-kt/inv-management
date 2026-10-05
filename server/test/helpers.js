import { once } from 'node:events';
import { openDb } from '../src/db.js';
import { buildApp } from '../src/app.js';

/** Spin up the API on an ephemeral port against a fresh in-memory database. */
export async function startTestServer() {
  const db = openDb(':memory:');
  const app = buildApp(db, { log: () => {} });
  const server = app.listen(0);
  await once(server, 'listening');
  const { port } = server.address();
  return {
    db,
    server,
    url: `http://127.0.0.1:${port}`,
    close() {
      server.close();
      db.close();
    },
  };
}

export async function api(base, method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, body: json };
}

/** Seed two orgs with full parallel catalog + draft state; returns their ids. */
export function seedTwoOrgs(db) {
  const insOrg = db.prepare('INSERT INTO organizations (name, slug) VALUES (?, ?)');
  const insSection = db.prepare('INSERT INTO sections (org_id, name, sort_order) VALUES (?, ?, 0)');
  const insCategory = db.prepare(
    "INSERT INTO categories (org_id, section_id, name, color, sort_order) VALUES (?, ?, ?, '#B8E6FE', 0)"
  );
  const insItem = db.prepare('INSERT INTO items (org_id, category_id, name, sort_order) VALUES (?, ?, ?, 0)');
  const insOrder = db.prepare("INSERT INTO orders (org_id, section_id) VALUES (?, ?)");
  const insLine = db.prepare(
    `INSERT INTO order_items (org_id, order_id, item_id, item_name, category_name, item_sort, category_sort, quantity)
     VALUES (?, ?, ?, ?, ?, 0, 0, 2)`
  );

  return ['SEL', 'Decoy'].map((name) => {
    const orgId = insOrg.run(name, name.toLowerCase()).lastInsertRowid;
    const sectionId = insSection.run(orgId, `${name} Bar`).lastInsertRowid;
    const categoryId = insCategory.run(orgId, sectionId, `${name} Store`).lastInsertRowid;
    const itemId = insItem.run(orgId, categoryId, `${name} Item`).lastInsertRowid;
    const orderId = insOrder.run(orgId, sectionId).lastInsertRowid;
    insLine.run(orgId, orderId, itemId, `${name} Item`, `${name} Store`);
    return { orgId, sectionId, categoryId, itemId, orderId };
  });
}
