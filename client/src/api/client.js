// Thin fetch wrapper. All paths are org-scoped: set the org once at bootstrap,
// then call api('/sections/3/catalog') etc.
export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

let orgId = null;

export function setOrgId(id) {
  orgId = id;
  try { localStorage.setItem('sel_current_org', String(id)); } catch { /* private mode */ }
}

/** The org preferred on this device (survives reloads; used after login). */
export function getPreferredOrgId() {
  try { return localStorage.getItem('sel_current_org'); } catch { return null; }
}

export function getOrgId() {
  return orgId;
}

export async function fetchOrgs() {
  const res = await fetch('/api/orgs');
  if (!res.ok) throw new ApiError(res.status, 'UNKNOWN', 'Failed to load organizations');
  return res.json();
}

/** Public (non-org-scoped) request — auth endpoints live here. */
export async function apiPublic(path, { method = 'POST', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const json = await res.json().catch(() => null);
    const err = json?.error;
    throw new ApiError(res.status, err?.code ?? 'UNKNOWN', err?.message ?? res.statusText, err?.details);
  }
  return res.json();
}

export async function api(path, { method = 'GET', body } = {}) {
  if (orgId === null) throw new Error('Organization not set — bootstrap first');
  const res = await fetch(`/api/orgs/${orgId}${path}`, {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const json = await res.json().catch(() => null);
    const err = json?.error;
    throw new ApiError(res.status, err?.code ?? 'UNKNOWN', err?.message ?? res.statusText, err?.details);
  }
  return res.json();
}

export function isApiError(err, code) {
  return err instanceof ApiError && (code === undefined || err.code === code);
}
