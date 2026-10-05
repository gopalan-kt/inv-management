import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import * as svc from '../services/categories.js';
import * as itemsSvc from '../services/items.js';

const idParam = z.object({ id: z.coerce.number().int().positive() });
const cidParam = z.object({ cid: z.coerce.number().int().positive() });
const reorderBody = z.object({ orderedIds: z.array(z.number().int().positive()).max(1000) }).strict();
const itemBody = z.object({
  name: z.string().trim().min(1).max(200),
  unit: z.string().trim().max(50).nullish(),
  maxStock: z.number().int().min(0).max(9999).nullish(),
}).strict();

export function categoriesRouter(db) {
  const router = Router();

  router.patch('/:id', validate({
    params: idParam,
    body: z.object({
      name: z.string().trim().min(1).max(100).optional(),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
      sortOrder: z.number().int().min(0).optional(),
    }).strict(),
  }), (req, res) => {
    res.json(svc.updateCategory(db, req.orgId, req.validated.params.id, req.validated.body));
  });

  router.delete('/:id', validate({ params: idParam }), (req, res) => {
    svc.deleteCategory(db, req.orgId, req.validated.params.id);
    res.json({ ok: true });
  });

  router.post('/:cid/items', validate({ params: cidParam, body: itemBody }), (req, res) => {
    res.status(201).json(itemsSvc.createItem(db, req.orgId, req.validated.params.cid, req.validated.body));
  });

  router.post('/:cid/items/reorder', validate({ params: cidParam, body: reorderBody }), (req, res) => {
    itemsSvc.reorderItems(db, req.orgId, req.validated.params.cid, req.validated.body.orderedIds);
    res.json({ ok: true });
  });

  return router;
}
