import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { nanoid } from 'nanoid';
import db from '../db/database.js';
import { signToken, requireAuth } from '../middleware/auth.js';
import { EMAIL_RE, MIN_PASSWORD_LENGTH } from '../lib/validation.js';
import { isLocked, recordFailure, clearFailures } from '../lib/loginLockout.js';

const router = Router();

// Per-IP throttle, backstopping the per-email lockout below against attackers
// spraying many different email addresses from one source.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again later.' },
});

function publicUser(row) {
  return { id: row.id, name: row.name, email: row.email, role: row.role };
}

/**
 * POST /api/auth/register — self-service registration (role: user).
 * Disabled by default; set ALLOW_REGISTRATION=open to allow it.
 */
router.post('/register', authLimiter, async (req, res) => {
  if (process.env.ALLOW_REGISTRATION !== 'open') {
    return res.status(403).json({ error: 'Self-service registration is disabled. Ask an admin to create your account.' });
  }

  const { name, email, password } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'name, email and password are required' });
  }
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }
  if (String(password).length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
  }

  const { rows: existing } = await db.query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing[0]) {
    return res.status(409).json({ error: 'Email already registered' });
  }

  const now = Date.now();
  const user = {
    id: nanoid(),
    name,
    email,
    role: 'user',
    token_version: 0,
  };
  const hash = bcrypt.hashSync(password, 10);
  await db.query(
    `INSERT INTO users (id, name, email, password_hash, role, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [user.id, name, email, hash, 'user', now, now]
  );

  res.status(201).json({ token: signToken(user), user: publicUser(user) });
});

/**
 * POST /api/auth/login
 */
router.post('/login', authLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  if (isLocked(email)) {
    return res.status(429).json({ error: 'Too many failed attempts. Please try again later.' });
  }

  const { rows } = await db.query('SELECT * FROM users WHERE email = $1', [email]);
  const row = rows[0];
  if (!row || row.disabled_at !== null || !bcrypt.compareSync(password, row.password_hash)) {
    recordFailure(email);
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  clearFailures(email);
  res.json({ token: signToken(row), user: publicUser(row) });
});

/**
 * GET /api/auth/me — current user from token.
 */
router.get('/me', requireAuth, async (req, res) => {
  const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [req.user.sub]);
  const row = rows[0];
  if (!row) return res.status(404).json({ error: 'User not found' });
  res.json({ user: publicUser(row) });
});

export default router;
