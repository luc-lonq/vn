import crypto from 'node:crypto';

const PASSWORD = process.env.APP_PASSWORD;
if (!PASSWORD) {
  console.error('APP_PASSWORD manquant dans l\'environnement');
  process.exit(1);
}
const SECRET = process.env.SESSION_SECRET || crypto.createHash('sha256').update('viet:' + PASSWORD).digest('hex');
const COOKIE = 'viet_session';
const MAX_AGE = 30 * 24 * 3600 * 1000; // 30 jours

const sign = (v) => crypto.createHmac('sha256', SECRET).update(v).digest('hex');
const sha = (v) => crypto.createHash('sha256').update(String(v)).digest();

function makeToken() {
  const exp = String(Date.now() + MAX_AGE);
  return `${exp}.${sign(exp)}`;
}

function validToken(token) {
  if (!token || typeof token !== 'string') return false;
  const [exp, mac] = token.split('.');
  if (!exp || !mac || Number(exp) < Date.now()) return false;
  const expected = sign(exp);
  return mac.length === expected.length && crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected));
}

// anti brute-force très simple : 5 essais ratés / minute / IP
const failures = new Map();
function tooMany(ip) {
  const f = failures.get(ip);
  if (!f) return false;
  if (Date.now() - f.first > 60_000) { failures.delete(ip); return false; }
  return f.count >= 5;
}
function fail(ip) {
  const f = failures.get(ip);
  if (!f || Date.now() - f.first > 60_000) failures.set(ip, { first: Date.now(), count: 1 });
  else f.count++;
}

export function login(req, res) {
  const ip = req.ip;
  if (tooMany(ip)) return res.status(429).json({ error: 'Trop de tentatives, réessaie dans une minute.' });
  const ok = crypto.timingSafeEqual(sha(req.body?.password ?? ''), sha(PASSWORD));
  if (!ok) { fail(ip); return res.status(401).json({ error: 'Mot de passe incorrect' }); }
  failures.delete(ip);
  res.cookie(COOKIE, makeToken(), {
    httpOnly: true, sameSite: 'lax', maxAge: MAX_AGE,
    secure: process.env.COOKIE_SECURE === 'true',
  });
  res.json({ ok: true });
}

export function logout(_req, res) {
  res.clearCookie(COOKIE);
  res.json({ ok: true });
}

export function isAuthed(req) {
  return validToken(req.cookies?.[COOKIE]);
}

export function requireAuth(req, res, next) {
  if (isAuthed(req)) return next();
  res.status(401).json({ error: 'Non authentifié' });
}
