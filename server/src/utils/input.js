/** Coerces an untrusted value to a string capped at `max` characters. */
export function text(value, max = 100_000) {
  return (typeof value === 'string' ? value : '').slice(0, max);
}

/** Escapes LIKE wildcards so user input is matched literally. */
export function likePattern(query) {
  return `%${query.replace(/[\\%_]/g, '\\$&')}%`;
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const notFound = (what) => new HttpError(404, `${what} introuvable`);
export const badRequest = (message) => new HttpError(400, message);
