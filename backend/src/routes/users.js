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
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  const { rows } = await db.query('SELECT * FROM users ORDER BY created_at');
  res.json({ users: rows.map(publicUser) });
});

/**
 * POST /api/users — create a user with an explicit role (admin only).
 */
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const { name, email, password, role } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'name, email and password are required' });
  }
  if (role && !['admin', 'user'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }
  const { rows: existing } = await db.query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing[0]) return res.status(409).json({ error: 'Email already registered' });

  const now = Date.now();
  const id = nanoid();
  const hash = bcrypt.hashSync(password, 10);
  const { rows } = await db.query(
    `INSERT INTO users (id, name, email, password_hash, role, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [id, name, email, hash, role || 'user', now, now]
  );

  res.status(201).json({ user: publicUser(rows[0]) });
});

/**
 * PATCH /api/users/:id/role — change a user's role (admin only).
 */
router.patch('/:id/role', requireAuth, requireAdmin, async (req, res) => {
  const { role } = req.body || {};
  if (!['admin', 'user'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }
  const { rows } = await db.query(
    `UPDATE users SET role = $1, updated_at = $2 WHERE id = $3 RETURNING *`,
    [role, Date.now(), req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'User not found' });
  res.json({ user: publicUser(rows[0]) });
});

/**
 * DELETE /api/users/:id — delete a user (admin only, cannot delete self).
 */
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  if (req.params.id === req.user.sub) {
    return res.status(400).json({ error: 'You cannot delete your own account' });
  }
  const { rows } = await db.query('DELETE FROM users WHERE id = $1 RETURNING id', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'User not found' });
  res.json({ ok: true });
});

export default router;
