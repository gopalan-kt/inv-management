import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import * as svc from '../services/orders.js';

const idParam = z.object({ id: z.coerce.number().int().positive() });

const linesBody = z.object({
  lines: z.array(z.object({
    itemId: z.number().int().positive(),
    quantity: z.number().int().min(0).max(999),
    needOnly: z.boolean(),
    noStock: z.boolean(),
    currentCount: z.number().int().min(0).max(9999).nullable().optional(),
  })).max(2000),
}).strict();

export function ordersRouter(db) {
  const router = Router();

  // The purchasing queue — org-wide sent orders awaiting purchase
  // (?purchased=1 → the confirmed list). Registered before /:id so "shopping"
  // isn't captured as an order id.
  router.get('/shopping', validate({
    query: z.object({ purchased: z.coerce.boolean().optional() }),
  }), (req, res) => {
    res.json(svc.listShopping(db, req.orgId, { purchased: req.validated.query.purchased ?? false }));
  });

  // Purchase staff confirm the buy (with bill/receipt reference).
  router.post('/:id/purchase', validate({
    params: idParam,
    body: z.object({ billRef: z.string().trim().min(1).max(200).nullish() }).strict(),
  }), (req, res) => {
    res.json(svc.confirmPurchase(db, req.orgId, req.validated.params.id, req.validated.body));
  });

  // Org-wide history — the "All" view.
  router.get('/', validate({
    query: z.object({
      status: z.enum(['draft', 'sent', 'received', 'cancelled']).optional(),
      limit: z.coerce.number().int().min(1).max(200).optional(),
    }),
  }), (req, res) => {
    const { status, limit } = req.validated.query;
    res.json(svc.listOrdersOrgWide(db, req.orgId, { status, limit }));
  });

  // Strike-off toggle for the shopping notepad.
  router.post('/:id/lines/:itemId/purchase', validate({
    params: z.object({ id: z.coerce.number().int().positive(), itemId: z.coerce.number().int().positive() }),
    body: z.object({ purchased: z.boolean() }).strict(),
  }), (req, res) => {
    const { id, itemId } = req.validated.params;
    res.json(svc.setLinePurchased(db, req.orgId, id, itemId, req.validated.body.purchased));
  });

  // Purchaser sets the quantity on a need-marked line while shopping.
  router.post('/:id/lines/:itemId/quantity', validate({
    params: z.object({ id: z.coerce.number().int().positive(), itemId: z.coerce.number().int().positive() }),
    body: z.object({ quantity: z.number().int().min(0).max(999) }).strict(),
  }), (req, res) => {
    const { id, itemId } = req.validated.params;
    res.json(svc.setLineQuantity(db, req.orgId, id, itemId, req.validated.body.quantity));
  });

  router.get('/:id', validate({ params: idParam }), (req, res) => {
    res.json(svc.getOrderWithLines(db, req.orgId, req.validated.params.id));
  });

  // The one write endpoint for the count screen: full draft line state.
  router.put('/:id/lines', validate({ params: idParam, body: linesBody }), (req, res) => {
    res.json(svc.putLines(db, req.orgId, req.validated.params.id, req.validated.body.lines));
  });

  router.post('/:id/send', validate({ params: idParam }), (req, res) => {
    res.json(svc.sendOrder(db, req.orgId, req.validated.params.id));
  });

  router.post('/:id/receive', validate({ params: idParam }), (req, res) => {
    res.json(svc.receiveOrder(db, req.orgId, req.validated.params.id));
  });

  router.post('/:id/cancel', validate({ params: idParam }), (req, res) => {
    res.json(svc.cancelOrder(db, req.orgId, req.validated.params.id));
  });

  return router;
}
