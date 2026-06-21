import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';
import db from '../db/database.js';
import { signToken, requireAuth } from '../middleware/auth.js';

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function publicUser(row) {
  return { id: row.id, name: row.name, email: row.email, role: row.role };
}

/**
 * POST /api/auth/register — self-service registration (role: user).
 */
router.post('/register', (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'name, email and password are required' });
  }
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    return res.status(409).json({ error: 'Email already registered' });
  }

  const now = Date.now();
  const user = {
    id: nanoid(),
    name,
    email,
    role: 'user',
  };
  const hash = bcrypt.hashSync(password, 10);
  db.prepare(
    `INSERT INTO users (id, name, email, password_hash, role, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(user.id, name, email, hash, 'user', now, now);

  res.status(201).json({ token: signToken(user), user });
});

/**
 * POST /api/auth/login
 */
router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  res.json({ token: signToken(row), user: publicUser(row) });
});

/**
 * GET /api/auth/me — current user from token.
 */
router.get('/me', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.sub);
  if (!row) return res.status(404).json({ error: 'User not found' });
  res.json({ user: publicUser(row) });
});

export default router;
