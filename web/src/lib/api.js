export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

let onUnauthorized = () => {};

/** Registers the callback run when a session expires (any 401 outside /auth). */
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

/** JSON fetch wrapper for the backend API. Throws ApiError on non-2xx responses. */
export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth')) onUnauthorized();
    throw new ApiError(res.status, data.error || `Erreur ${res.status}`);
  }
  return data;
}

/** Appends `?q=…` when the search query isn't empty. */
export const withQuery = (path, q) => (q ? `${path}?q=${encodeURIComponent(q)}` : path);
