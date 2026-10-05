import { httpError } from '../errors.js';

/**
 * Zod validation middleware factory. Validates parts of the request against the
 * given schemas and stores the parsed result on `req.validated` — Express 5 makes
 * `req.query` a read-only getter, so routes read from `req.validated.query` etc.
 *
 * @param {{ params?: import('zod').ZodType, query?: import('zod').ZodType, body?: import('zod').ZodType }} schemas
 */
export function validate(schemas) {
  return (req, _res, next) => {
    req.validated = {};
    for (const part of ['params', 'query', 'body']) {
      const schema = schemas[part];
      if (!schema) continue;
      const result = schema.safeParse(req[part]);
      if (!result.success) {
        throw httpError(400, 'VALIDATION_ERROR', 'Invalid request', {
          details: result.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        });
      }
      req.validated[part] = result.data;
    }
    next();
  };
}
