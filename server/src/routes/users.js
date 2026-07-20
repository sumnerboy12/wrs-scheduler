import { Router } from 'express';
import db from '../db/index.js';
import { hashPassword } from '../lib/auth.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth, requireAdmin);

const ROLES = ['admin', 'editor', 'readonly'];

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    active: !!user.active,
    must_change_password: !!user.must_change_password,
    created_at: user.created_at,
  };
}

function countOtherActiveAdmins(excludingId) {
  return db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin' AND active = 1 AND id != ?").get(excludingId).c;
}

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM users ORDER BY username').all();
  res.json(rows.map(publicUser));
});

router.post('/', (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !username.trim()) return res.status(400).json({ error: 'Username is required' });
  if (!password || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  if (role != null && !ROLES.includes(role)) return res.status(400).json({ error: 'Invalid role' });

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username.trim());
  if (existing) return res.status(400).json({ error: 'That username is already taken' });

  const result = db
    .prepare('INSERT INTO users (username, password_hash, role, must_change_password) VALUES (?, ?, ?, 1)')
    .run(username.trim(), hashPassword(password), role || 'editor');

  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(publicUser(row));
});

router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'not found' });

  const { role, active } = req.body;
  if (role != null && !ROLES.includes(role)) return res.status(400).json({ error: 'Invalid role' });
  const nextRole = role ?? existing.role;
  const nextActive = active != null ? (active ? 1 : 0) : existing.active;

  const losingAdminCoverage = existing.role === 'admin' && existing.active && (nextRole !== 'admin' || !nextActive);
  if (losingAdminCoverage && countOtherActiveAdmins(id) === 0) {
    return res.status(400).json({ error: 'Cannot remove the last admin' });
  }

  db.prepare(`UPDATE users SET role = ?, active = ?, updated_at = datetime('now') WHERE id = ?`).run(nextRole, nextActive, id);

  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  res.json(publicUser(row));
});

router.post('/:id/reset-password', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'not found' });

  const { password } = req.body;
  if (!password || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  db.prepare(`UPDATE users SET password_hash = ?, must_change_password = 1, updated_at = datetime('now') WHERE id = ?`).run(
    hashPassword(password),
    id
  );
  res.status(204).end();
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) return res.status(400).json({ error: "You can't remove your own account" });

  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'not found' });

  if (existing.role === 'admin' && existing.active && countOtherActiveAdmins(id) === 0) {
    return res.status(400).json({ error: 'Cannot remove the last admin' });
  }

  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  res.status(204).end();
});

export default router;
