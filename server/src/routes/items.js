import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import * as svc from '../services/items.js';

const idParam = z.object({ id: z.coerce.number().int().positive() });

const itemPatch = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  unit: z.string().trim().max(50).nullable().optional(),
  categoryId: z.number().int().positive().optional(),
  sortOrder: z.number().int().min(0).optional(),
  maxStock: z.number().int().min(0).max(9999).nullable().optional(),
}).strict();

export function itemsRouter(db) {
  const router = Router();

  router.patch('/:id', validate({ params: idParam, body: itemPatch }), (req, res) => {
    res.json(svc.updateItem(db, req.orgId, req.validated.params.id, req.validated.body));
  });

  router.delete('/:id', validate({ params: idParam }), (req, res) => {
    svc.deleteItem(db, req.orgId, req.validated.params.id);
    res.json({ ok: true });
  });

  return router;
}
