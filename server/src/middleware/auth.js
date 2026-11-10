import crypto from 'node:crypto';
import { Router } from 'express';

const COOKIE_NAME = 'viet_session';
const SESSION_TTL = 30 * 24 * 3600 * 1000; // 30 days
const MAX_FAILURES = 5;
const FAILURE_WINDOW = 60 * 1000;

const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest();

function safeEqual(a, b) {
  return a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Stateless sessions: the cookie holds "<expiry>.<hmac(expiry)>".
 * Changing the password or SESSION_SECRET invalidates every session.
 */
function createSessions(secret) {
  const sign = (value) => crypto.createHmac('sha256', secret).update(value).digest('hex');
  return {
    issue() {
      const expiry = String(Date.now() + SESSION_TTL);
      return `${expiry}.${sign(expiry)}`;
    },
    verify(token) {
      if (typeof token !== 'string') return false;
      const [expiry, mac] = token.split('.');
      if (!expiry || !mac || Number(expiry) < Date.now()) return false;
      return safeEqual(mac, sign(expiry));
    },
  };
}

/** Minimal per-IP brute-force protection, kept in memory. */
function createRateLimiter() {
  const failures = new Map();
  const current = (ip) => {
    const entry = failures.get(ip);
    if (entry && Date.now() - entry.since > FAILURE_WINDOW) {
      failures.delete(ip);
      return null;
    }
    return entry;
  };
  return {
    isBlocked: (ip) => (current(ip)?.count ?? 0) >= MAX_FAILURES,
    fail(ip) {
      const entry = current(ip);
      if (entry) entry.count++;
      else failures.set(ip, { since: Date.now(), count: 1 });
    },
    reset: (ip) => failures.delete(ip),
  };
}

export function createAuth(config) {
  const sessions = createSessions(config.sessionSecret);
  const limiter = createRateLimiter();
  const passwordHash = sha256(config.password);

  const isAuthenticated = (req) => sessions.verify(req.cookies?.[COOKIE_NAME]);

  const router = Router();

  router.post('/login', (req, res) => {
    if (limiter.isBlocked(req.ip)) {
      return res.status(429).json({ error: 'Trop de tentatives, réessaie dans une minute.' });
    }
    if (!crypto.timingSafeEqual(sha256(req.body?.password ?? ''), passwordHash)) {
      limiter.fail(req.ip);
      return res.status(401).json({ error: 'Mot de passe incorrect' });
    }
    limiter.reset(req.ip);
    res.cookie(COOKIE_NAME, sessions.issue(), {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.cookieSecure,
      maxAge: SESSION_TTL,
    });
    res.json({ ok: true });
  });

  router.post('/logout', (_req, res) => {
    res.clearCookie(COOKIE_NAME);
    res.json({ ok: true });
  });

  router.get('/me', (req, res) => res.json({ authed: isAuthenticated(req) }));

  function requireAuth(req, res, next) {
    if (isAuthenticated(req)) return next();
    res.status(401).json({ error: 'Non authentifié' });
  }

  return { router, requireAuth };
}
