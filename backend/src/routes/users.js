import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';
import db from '../db/database.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

function publicUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    createdAt: row.created_at,
  };
}

/**
 * GET /api/users — list all users (admin only).
 */
router.get('/', requireAuth, requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM users ORDER BY created_at').all();
  res.json({ users: rows.map(publicUser) });
});

/**
 * POST /api/users — create a user with an explicit role (admin only).
 */
router.post('/', requireAuth, requireAdmin, (req, res) => {
  const { name, email, password, role } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'name, email and password are required' });
  }
  if (role && !['admin', 'user'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(409).json({ error: 'Email already registered' });

  const now = Date.now();
  const id = nanoid();
  const hash = bcrypt.hashSync(password, 10);
  db.prepare(
    `INSERT INTO users (id, name, email, password_hash, role, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, name, email, hash, role || 'user', now, now);

  res.status(201).json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id)) });
});

/**
 * PATCH /api/users/:id/role — change a user's role (admin only).
 */
router.patch('/:id/role', requireAuth, requireAdmin, (req, res) => {
  const { role } = req.body || {};
  if (!['admin', 'user'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found' });

  db.prepare('UPDATE users SET role = ?, updated_at = ? WHERE id = ?').run(
    role,
    Date.now(),
    req.params.id
  );
  res.json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id)) });
});

/**
 * DELETE /api/users/:id — delete a user (admin only, cannot delete self).
 */
router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  if (req.params.id === req.user.sub) {
    return res.status(400).json({ error: 'You cannot delete your own account' });
  }
  const target = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found' });

  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
