import { httpError } from '../errors.js';

/**
 * Resolves :orgId from the path, 404s if the org doesn't exist, and pins
 * `req.orgId` for every downstream handler. All org scoping flows through here —
 * service queries must always filter by `req.orgId`.
 */
export function loadOrg(db) {
  const getOrg = db.prepare('SELECT id FROM organizations WHERE id = ?');
  return (req, _res, next) => {
    const orgId = Number(req.params.orgId);
    if (!Number.isInteger(orgId) || orgId <= 0) {
      throw httpError(404, 'NOT_FOUND', 'Organization not found');
    }
    if (!getOrg.get(orgId)) {
      throw httpError(404, 'NOT_FOUND', 'Organization not found');
    }
    req.orgId = orgId;
    next();
  };
}
