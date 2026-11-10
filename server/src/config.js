import crypto from 'node:crypto';

/**
 * Reads and validates configuration from environment variables.
 * Throws instead of exiting so it can be unit-tested.
 */
export function loadConfig(env = process.env) {
  const password = env.APP_PASSWORD;
  if (!password) throw new Error('APP_PASSWORD is required');

  return {
    port: Number(env.PORT || 3001),
    dbPath: env.DB_PATH || './data/viet.db',
    staticDir: env.STATIC_DIR || null,
    password,
    // Falls back to a secret derived from the password, so sessions survive restarts.
    sessionSecret:
      env.SESSION_SECRET || crypto.createHash('sha256').update(`viet:${password}`).digest('hex'),
    cookieSecure: env.COOKIE_SECURE === 'true',
    newCardsPerDay: Number(env.NEW_CARDS_PER_DAY || 20),
  };
}
