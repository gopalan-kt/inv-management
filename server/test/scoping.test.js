// The decoy-org test: two orgs with parallel data. Every org-scoped GET must
// return the requesting org's rows and ZERO of the other org's rows. This is the
// only thing that can catch an org-scoping leak while the app runs a single org
// in production.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, api, seedTwoOrgs } from './helpers.js';

let ctx;
let main;
let decoy;

beforeEach(async () => {
  ctx = await startTestServer();
  [main, decoy] = seedTwoOrgs(ctx.db);
});

afterEach(() => ctx.close());

test('GET /api/orgs lists all orgs (bootstrap is intentionally unscoped)', async () => {
  const { status, body } = await api(ctx.url, 'GET', '/api/orgs');
  assert.equal(status, 200);
  assert.equal(body.length, 2);
  assert.deepEqual(body.map((o) => o.slug).sort(), ['decoy', 'sel']);
});

test('unknown org id → 404 envelope', async () => {
  const { status, body } = await api(ctx.url, 'GET', '/api/orgs/999999/sections');
  assert.equal(status, 404);
  assert.equal(body.error.code, 'NOT_FOUND');
});

test('non-numeric org id → 404 envelope', async () => {
  const { status, body } = await api(ctx.url, 'GET', '/api/orgs/abc/sections');
  assert.equal(status, 404);
  assert.equal(body.error.code, 'NOT_FOUND');
});

const SCOPED_GETS = (sid) => [
  ['/sections', (body) => body.map((s) => s.id), true],
  ['/orders/shopping', (body) => body.map((o) => o.id), false],
  ['/orders', (body) => body.map((o) => o.id), true],
  ['/catalog', (body) => body.flatMap((s) => [s.id, ...s.categories.map((c) => c.id)]), true],
  ['/inventory', (body) => body.map((r) => r.itemId), false],
  [`/sections/${sid}/catalog`, (body) => [body.id, ...body.categories.map((c) => c.id)], true],
  [`/sections/${sid}/draft`, (body) => [body.id, ...body.lines.map((l) => l.itemId)], true],
  [`/sections/${sid}/orders`, (body) => body.map((o) => o.id), true],
  [`/sections/${sid}/receivable`, (body) => [body.count], false],
  [`/sections/${sid}/categories`, (body) => body.map((c) => c.id), true],
];

test('every org-scoped GET returns only the requesting org rows (main↔decoy)', async () => {
  const { db } = ctx;
  const mainSections = db.prepare('SELECT id FROM sections WHERE org_id = ?').all(main.orgId).map((r) => r.id);
  const decoySections = db.prepare('SELECT id FROM sections WHERE org_id = ?').all(decoy.orgId).map((r) => r.id);
  assert.equal(mainSections.length, 1);
  assert.equal(decoySections.length, 1);

  for (const [path, pick, mustIncludeOwn] of SCOPED_GETS(mainSections[0])) {
    const res = await api(ctx.url, 'GET', `/api/orgs/${main.orgId}${path}`);
    assert.equal(res.status, 200, `GET ${path} should work for the owning org`);
    const ids = pick(res.body).flat().filter((v) => typeof v === 'number' && v > 0);
    assert.equal(
      ids.filter((id) => id === decoy.sectionId || id === decoy.orderId || id === decoy.categoryId || id === decoy.itemId).length,
      0,
      `GET ${path} leaked decoy-org data`
    );
    if (mustIncludeOwn) {
      assert.ok(
        ids.includes(main.sectionId) || ids.includes(main.orderId) || ids.includes(main.categoryId),
        `GET ${path} should include own-org data`
      );
    }
  }

  // Same sweep from the decoy side: main-org identifiers must never appear.
  const mainNames = ['SEL Bar', 'SEL Store', 'SEL Item'];
  for (const [path, pick] of SCOPED_GETS(decoySections[0])) {
    const raw = await api(ctx.url, 'GET', `/api/orgs/${decoy.orgId}${path}`);
    assert.equal(raw.status, 200);
    const text = JSON.stringify(raw.body);
    for (const name of mainNames) {
      assert.equal(text.includes(name), false, `GET ${path} on decoy org leaked "${name}"`);
    }
    const ids = pick(raw.body).flat().filter((v) => typeof v === 'number' && v > 0);
    assert.equal(
      ids.filter((id) => id === main.sectionId || id === main.orderId || id === main.categoryId || id === main.itemId).length,
      0,
      `GET ${path} on decoy org leaked main-org ids`
    );
  }
});

test('order detail is org-scoped', async () => {
  const asDecoy = await api(ctx.url, 'GET', `/api/orgs/${decoy.orgId}/orders/${main.orderId}`);
  assert.equal(asDecoy.status, 404);
  const asMain = await api(ctx.url, 'GET', `/api/orgs/${main.orgId}/orders/${main.orderId}`);
  assert.equal(asMain.status, 200);
  assert.equal(asMain.body.lines[0].itemName, 'SEL Item');
});

test('write transitions are org-scoped', async () => {
  const send = await api(ctx.url, 'POST', `/api/orgs/${decoy.orgId}/orders/${main.orderId}/send`);
  assert.equal(send.status, 404);
  const lines = await api(ctx.url, 'PUT', `/api/orgs/${decoy.orgId}/orders/${main.orderId}/lines`, { lines: [] });
  assert.equal(lines.status, 404);
  const quantity = await api(ctx.url, 'POST',
    `/api/orgs/${decoy.orgId}/orders/${main.orderId}/lines/${main.itemId}/quantity`, { quantity: 1 });
  assert.equal(quantity.status, 404);
  // Main org can still do it.
  const ok = await api(ctx.url, 'POST', `/api/orgs/${main.orgId}/orders/${main.orderId}/send`);
  assert.equal(ok.status, 200);
  assert.equal(ok.body.status, 'sent');
});
