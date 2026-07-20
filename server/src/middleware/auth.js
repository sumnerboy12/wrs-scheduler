import db from '../db/index.js';

export function requireAuth(req, res, next) {
  const userId = req.session?.userId;
  if (!userId) return res.status(401).json({ error: 'not authenticated' });

  const user = db.prepare('SELECT id, username, role, active, must_change_password FROM users WHERE id = ?').get(userId);
  if (!user || !user.active) {
    return req.session.destroy(() => res.status(401).json({ error: 'not authenticated' }));
  }

  req.user = user;
  next();
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'admin access required' });
  next();
}

export function requireWrite(req, res, next) {
  if (req.user?.role === 'readonly') return res.status(403).json({ error: 'read-only access' });
  next();
}
