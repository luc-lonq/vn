import crypto from 'node:crypto';

/** Parses "1 10" (minutes, space or comma separated) into [1, 10]. */
function parseSteps(value, name) {
  if (value === undefined || value.trim() === '') return undefined;
  const steps = value
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(Number);
  if (steps.some((n) => !Number.isFinite(n) || n <= 0)) {
    throw new Error(`${name} must be positive numbers of minutes, e.g. "1 10"`);
  }
  return steps;
}

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
    // Overrides for the scheduler's Anki defaults; undefined keeps the default.
    scheduler: Object.fromEntries(
      Object.entries({
        learningSteps: parseSteps(env.LEARNING_STEPS, 'LEARNING_STEPS'),
        relearningSteps: parseSteps(env.RELEARNING_STEPS, 'RELEARNING_STEPS'),
        dayStartHour: env.NEXT_DAY_STARTS_AT ? Number(env.NEXT_DAY_STARTS_AT) : undefined,
      }).filter(([, v]) => v !== undefined)
    ),
  };
}
