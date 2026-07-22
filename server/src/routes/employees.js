import { Router } from 'express';
import db from '../db/index.js';
import { requireWrite } from '../middleware/auth.js';
import { broadcast } from '../lib/events.js';

const router = Router();

router.get('/', (req, res) => {
  const { active } = req.query;
  let rows;
  if (active === '1') {
    rows = db.prepare('SELECT * FROM employees WHERE active = 1 ORDER BY name').all();
  } else {
    rows = db.prepare('SELECT * FROM employees ORDER BY name').all();
  }
  res.json(rows);
});

router.post('/', requireWrite, (req, res) => {
  const { name, role, email, phone, color, notes } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });

  const result = db
    .prepare(
      `INSERT INTO employees (name, role, email, phone, color, notes)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(name.trim(), role || null, email || null, phone || null, color || '#4f7cff', notes || null);

  const row = db.prepare('SELECT * FROM employees WHERE id = ?').get(result.lastInsertRowid);
  broadcast('employees');
  res.status(201).json(row);
});

router.put('/:id', requireWrite, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM employees WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'not found' });

  const { name, role, email, phone, color, active, notes } = req.body;
  db.prepare(
    `UPDATE employees SET
       name = ?, role = ?, email = ?, phone = ?, color = ?, active = ?, notes = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    name ?? existing.name,
    role ?? existing.role,
    email ?? existing.email,
    phone ?? existing.phone,
    color ?? existing.color,
    active ?? existing.active,
    notes ?? existing.notes,
    id
  );

  const row = db.prepare('SELECT * FROM employees WHERE id = ?').get(id);
  broadcast('employees');
  res.json(row);
});

router.delete('/:id', requireWrite, (req, res) => {
  const id = Number(req.params.id);
  db.prepare('DELETE FROM employees WHERE id = ?').run(id);
  broadcast('employees');
  res.status(204).end();
});

export default router;
