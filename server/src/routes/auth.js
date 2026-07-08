import { Router } from 'express';
import db from '../db/index.js';
import { hashPassword, verifyPassword } from '../lib/auth.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    is_admin: !!user.is_admin,
    must_change_password: !!user.must_change_password,
  };
}

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'username and password are required' });

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(String(username).trim());
  if (!user || !user.active || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'login failed' });
    req.session.userId = user.id;
    res.json(publicUser(user));
  });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.status(204).end());
});

router.get('/me', requireAuth, (req, res) => {
  res.json(publicUser(req.user));
});

router.post('/change-password', requireAuth, (req, res) => {
  const { current_password, new_password } = req.body;
  if (!new_password || new_password.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!current_password || !verifyPassword(current_password, user.password_hash)) {
    return res.status(400).json({ error: 'Current password is incorrect' });
  }

  db.prepare(`UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = datetime('now') WHERE id = ?`).run(
    hashPassword(new_password),
    user.id
  );
  res.status(204).end();
});

export default router;
