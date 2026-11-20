// Autenticación del panel: contraseña con scrypt + sesiones con token aleatorio.
import crypto from 'node:crypto';
import { db } from '../db.js';
import { config } from '../config.js';

export const SESSION_COOKIE = 'kf_session';

/** Genera el hash que va en ADMIN_PASSWORD_HASH. Formato: scrypt$<salt>$<hash> */
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password, stored) {
  const [scheme, salt, hash] = String(stored || '').split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = crypto.scryptSync(String(password), salt, expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

export function verifyCredentials(username, password) {
  if (!config.admin.passwordHash) return false;
  const a = Buffer.from(String(username));
  const b = Buffer.from(config.admin.username);
  const userOk = a.length === b.length && crypto.timingSafeEqual(a, b);
  const passOk = verifyPassword(password, config.admin.passwordHash); // se evalúa siempre
  return userOk && passOk;
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

export function createSession() {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = Date.now() + config.admin.sessionHours * 3600_000;
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  db.prepare('INSERT INTO sessions (token_hash, expires_at) VALUES (?, ?)').run(sha256(token), expires);
  return { token, expires };
}

export function destroySession(token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
}

export function isValidSession(token) {
  if (!token) return false;
  const row = db.prepare('SELECT expires_at FROM sessions WHERE token_hash = ?').get(sha256(token));
  return !!row && row.expires_at > Date.now();
}

export function cookieOptions(expires) {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: config.isProd,
    path: '/',
    ...(expires ? { expires: new Date(expires) } : {}),
  };
}

/** Exige sesión válida. Las peticiones que modifican datos además requieren una cabecera propia (defensa CSRF). */
export function requireAdmin(req, res, next) {
  if (!isValidSession(req.cookies?.[SESSION_COOKIE])) {
    return res.status(401).json({ error: 'No autorizado. Inicia sesión.' });
  }
  if (!['GET', 'HEAD'].includes(req.method) && req.get('X-Requested-With') !== 'keflita-admin') {
    return res.status(403).json({ error: 'Petición rechazada.' });
  }
  next();
}
