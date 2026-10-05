// Application errors + the central error handler.
// Every error response uses the envelope: { "error": { "code", "message", "details?" } }

export function httpError(status, code, message, extra = {}) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  Object.assign(err, extra);
  return err;
}

// SQLite constraint errors → friendly 409s, keyed by the offending index.
const CONSTRAINT_MAP = [
  [/ux_sections_org_name/, 409, 'NAME_TAKEN', 'A section with this name already exists'],
  [/ux_categories_section_name/, 409, 'NAME_TAKEN', 'A category with this name already exists'],
  [/ux_items_category_name/, 409, 'NAME_TAKEN', 'An item with this name already exists'],
  [/ux_orders_one_draft_per_section/, 409, 'DRAFT_EXISTS', 'This section already has a draft order'],
];

export function errorHandler(log) {
  // eslint-disable-next-line no-unused-vars
  return (err, _req, res, _next) => {
    if (typeof err?.code === 'string' && err.code.startsWith('SQLITE_CONSTRAINT') && !err.status) {
      const match = CONSTRAINT_MAP.find(([pattern]) => pattern.test(err.message));
      if (match) {
        const [, status, code, message] = match;
        err = httpError(status, code, message);
      } else {
        err = httpError(409, 'CONSTRAINT_VIOLATION', 'The change violates a data constraint');
      }
    }

    const status = err.status || 500;
    if (status >= 500) (log ?? console.error)(err);

    res.status(status).json({
      error: {
        code: err.code || 'INTERNAL_ERROR',
        message: err.message || 'Something went wrong',
        ...(err.details ? { details: err.details } : {}),
      },
    });
  };
}

export function notFoundHandler(req, res) {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` },
  });
}
