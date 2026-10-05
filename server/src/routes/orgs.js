import { Router } from 'express';

export function orgsRouter(db) {
  const router = Router();

  router.get('/', (_req, res) => {
    const orgs = db
      .prepare('SELECT id, name, slug, created_at FROM organizations ORDER BY id')
      .all();
    res.json(orgs);
  });

  return router;
}
