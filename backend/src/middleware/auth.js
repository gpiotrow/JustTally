import jwt from 'jsonwebtoken';
import db from '../db/database.js';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error(
    'JWT_SECRET is not set. Generate one with `node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"` and add it to your environment.'
  );
}

/**
 * Sign a JWT for a user. The token only carries an identity + version — role,
 * name and email are re-read from the DB on every request so changes take
 * effect immediately instead of waiting out the token's 30-day lifetime.
 */
export function signToken(user) {
  return jwt.sign(
    { sub: user.id, tokenVersion: user.token_version ?? 0 },
    JWT_SECRET,
    { algorithm: 'HS256', expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
  );
}

/**
 * Require a valid JWT. Attaches req.user from a fresh DB lookup so a
 * revoked (token_version bumped) or disabled account is rejected immediately,
 * not just once the token expires.
 */
export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  let payload;
  try {
    // Only a symmetric secret is used here (no keypair), so the classic
    // RS256-public-key-as-HMAC-secret confusion isn't reachable today — but
    // pinning the algorithm defends a future switch to asymmetric keys from
    // silently accepting whatever alg a token claims.
    payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [payload.sub]);
  const row = rows[0];
  if (!row || row.disabled_at !== null || row.token_version !== payload.tokenVersion) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.user = { sub: row.id, role: row.role, name: row.name, email: row.email };
  next();
}

/**
 * Require the authenticated user to be an admin.
 * Must run after requireAuth.
 */
export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}
