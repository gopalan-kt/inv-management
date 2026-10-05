import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import * as svc from '../services/sections.js';
import * as ordersSvc from '../services/orders.js';
import * as categoriesSvc from '../services/categories.js';

const sectionBody = z.object({ name: z.string().trim().min(1).max(100) }).strict();
const sectionPatch = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  sortOrder: z.number().int().min(0).optional(),
}).strict();
const reorderBody = z.object({ orderedIds: z.array(z.number().int().positive()).max(500) }).strict();
const sidParam = z.object({ sid: z.coerce.number().int().positive() });
const idParam = z.object({ id: z.coerce.number().int().positive() });
const listQuery = z.object({
  includeInactive: z.coerce.boolean().optional(),
  status: z.enum(['draft', 'sent', 'received', 'cancelled']).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const categoryBody = z.object({ name: z.string().trim().min(1).max(100), color: color.nullish() }).strict();

export function sectionsRouter(db) {
  const router = Router();

  router.get('/', validate({ query: listQuery }), (req, res) => {
    res.json(svc.listSections(db, req.orgId, { includeInactive: req.validated.query.includeInactive }));
  });

  router.post('/', validate({ body: sectionBody }), (req, res) => {
    res.status(201).json(svc.createSection(db, req.orgId, req.validated.body));
  });

  router.post('/reorder', validate({ body: reorderBody }), (req, res) => {
    svc.reorderSections(db, req.orgId, req.validated.body.orderedIds);
    res.json({ ok: true });
  });

  router.patch('/:id', validate({ params: idParam, body: sectionPatch }), (req, res) => {
    res.json(svc.updateSection(db, req.orgId, req.validated.params.id, req.validated.body));
  });

  router.delete('/:id', validate({ params: idParam }), (req, res) => {
    svc.deleteSection(db, req.orgId, req.validated.params.id);
    res.json({ ok: true });
  });

  // Count-screen payload
  router.get('/:sid/catalog', validate({ params: sidParam }), (req, res) => {
    res.json(svc.getCatalog(db, req.orgId, req.validated.params.sid));
  });

  // The section's current draft (404 NO_DRAFT = none open)
  router.get('/:sid/draft', validate({ params: sidParam }), (req, res) => {
    const draft = ordersSvc.findDraft(db, req.orgId, req.validated.params.sid);
    if (!draft) {
      res.status(404).json({ error: { code: 'NO_DRAFT', message: 'No draft order for this section' } });
      return;
    }
    res.json(draft);
  });

  // Idempotent draft creation — first tap on the count screen
  router.post('/:sid/orders', validate({ params: sidParam }), (req, res) => {
    res.json(ordersSvc.ensureDraft(db, req.orgId, req.validated.params.sid));
  });

  // Order history for the section
  router.get('/:sid/orders', validate({ params: sidParam, query: listQuery }), (req, res) => {
    const { status, limit } = req.validated.query;
    res.json(ordersSvc.listOrdersForSection(db, req.orgId, req.validated.params.sid, { status, limit }));
  });

  // Count of sent orders waiting to be received (the "N to receive" pill)
  router.get('/:sid/receivable', validate({ params: sidParam }), (req, res) => {
    res.json({ count: ordersSvc.countAwaitingReceive(db, req.orgId, req.validated.params.sid) });
  });

  // Categories within this section
  router.get('/:sid/categories', validate({ params: sidParam, query: listQuery }), (req, res) => {
    res.json(categoriesSvc.listCategories(db, req.orgId, req.validated.params.sid, {
      includeInactive: req.validated.query.includeInactive,
    }));
  });

  router.post('/:sid/categories', validate({ params: sidParam, body: categoryBody }), (req, res) => {
    res.status(201).json(categoriesSvc.createCategory(db, req.orgId, req.validated.params.sid, req.validated.body));
  });

  router.post('/:sid/categories/reorder', validate({ params: sidParam, body: reorderBody }), (req, res) => {
    categoriesSvc.reorderCategories(db, req.orgId, req.validated.params.sid, req.validated.body.orderedIds);
    res.json({ ok: true });
  });

  return router;
}
