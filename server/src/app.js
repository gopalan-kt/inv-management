import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { loadOrg } from './middleware/loadOrg.js';
import { validate } from './middleware/validate.js';
import { errorHandler, notFoundHandler } from './errors.js';
import { authRouter } from './routes/auth.js';
import { orgsRouter } from './routes/orgs.js';
import { sectionsRouter } from './routes/sections.js';
import { ordersRouter } from './routes/orders.js';
import { categoriesRouter } from './routes/categories.js';
import { itemsRouter } from './routes/items.js';
import * as sectionsService from './services/sections.js';
import { currentInventory } from './services/inventory.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = path.join(__dirname, '..', '..', 'client', 'dist');

/**
 * Build the Express app against a database handle. Separated from index.js so
 * tests can spin up the app on an in-memory database.
 *
 * In production (after `npm run build`) the same process also serves the built
 * client — one command, one port, the whole app.
 */
export function buildApp(db, { log } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());

  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  // Auth — public: register (new org + owner) and login.
  app.use('/api/auth', authRouter(db));

  // Bootstrap: list orgs (no auth in MVP — the client picks the first one).
  app.use('/api/orgs', orgsRouter(db));

  // Everything below is org-scoped.
  app.use('/api/orgs/:orgId', loadOrg(db));
  app.use('/api/orgs/:orgId/sections', sectionsRouter(db));
  app.use('/api/orgs/:orgId/categories', categoriesRouter(db));
  app.use('/api/orgs/:orgId/items', itemsRouter(db));
  app.use('/api/orgs/:orgId/orders', ordersRouter(db));

  // Org-wide catalog — the "All" view (every active section, catalog nested).
  app.get('/api/orgs/:orgId/catalog', (req, res) => {
    res.json(sectionsService.orgCatalog(db, req.orgId));
  });

  // Current Inventory — stock + pipeline per item, optionally per section.
  app.get('/api/orgs/:orgId/inventory', validate({
    query: z.object({ sectionId: z.coerce.number().int().positive().optional() }),
  }), (req, res) => {
    res.json(currentInventory(db, req.orgId, req.validated.query.sectionId ?? null));
  });

  const hasClientBuild = fs.existsSync(path.join(CLIENT_DIST, 'index.html'));
  if (hasClientBuild) {
    // Static assets first, then an Express-5-safe SPA fallback as a terminal
    // middleware (no wildcard route patterns).
    app.use(express.static(CLIENT_DIST));
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
      res.sendFile(path.join(CLIENT_DIST, 'index.html'));
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler(log));
  return app;
}
