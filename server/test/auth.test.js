// Auth: register (new org + owner) and login. Public routes by design.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, api } from './helpers.js';

let ctx;

beforeEach(async () => { ctx = await startTestServer(); });
afterEach(() => ctx.close());

test('register creates a new org + owner account with isolated data', async () => {
  const res = await api(ctx.url, 'POST', '/api/auth/register', {
    orgName: 'Desi District - Lewisville',
    email: 'owner@desidistrict.com',
    password: 'desi1234',
  });
  assert.equal(res.status, 201);
  assert.ok(res.body.user.id);
  assert.equal(res.body.user.role, 'owner');
  assert.equal(res.body.org.name, 'Desi District - Lewisville');

  // The new org starts empty and isolated: its sections/inventory are its own.
  const orgId = res.body.org.id;
  const sections = await api(ctx.url, 'GET', `/api/orgs/${orgId}/sections`);
  assert.equal(sections.body.length, 0);
  const inventory = await api(ctx.url, 'GET', `/api/orgs/${orgId}/inventory`);
  assert.equal(inventory.body.length, 0);

  // Duplicate email is refused.
  const dup = await api(ctx.url, 'POST', '/api/auth/register', {
    orgName: 'Another Venue',
    email: 'owner@desidistrict.com',
    password: 'whatever123',
  });
  assert.equal(dup.status, 409);
  assert.equal(dup.body.error.code, 'EMAIL_TAKEN');
});

test('login succeeds with correct credentials, fails with wrong ones', async () => {
  await api(ctx.url, 'POST', '/api/auth/register', {
    orgName: 'Bar Co',
    email: 'owner@barco.com',
    password: 'supersecret9',
  });

  const bad = await api(ctx.url, 'POST', '/api/auth/login',
    { email: 'owner@barco.com', password: 'wrongpass99' });
  assert.equal(bad.status, 401);
  assert.equal(bad.body.error.code, 'INVALID_CREDENTIALS');

  const unknown = await api(ctx.url, 'POST', '/api/auth/login',
    { email: 'nobody@barco.com', password: 'whatever1' });
  assert.equal(unknown.status, 401);

  const ok = await api(ctx.url, 'POST', '/api/auth/login',
    { email: 'OWNER@barco.com', password: 'supersecret9' }); // case-insensitive email
  assert.equal(ok.status, 200);
  assert.equal(ok.body.user.email, 'owner@barco.com');
  assert.equal(ok.body.org.name, 'Bar Co');

  // Validation: bad bodies → 400.
  const noPass = await api(ctx.url, 'POST', '/api/auth/login', { email: 'owner@barco.com' });
  assert.equal(noPass.status, 400);
  const shortPass = await api(ctx.url, 'POST', '/api/auth/register',
    { orgName: 'X', email: 'x@x.com', password: 'short' });
  assert.equal(shortPass.status, 400);
});
