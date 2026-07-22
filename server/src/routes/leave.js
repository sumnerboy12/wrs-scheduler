import { Router } from 'express';
import db from '../db/index.js';
import { requireWrite } from '../middleware/auth.js';
import { broadcast } from '../lib/events.js';

const router = Router();

const LEAVE_TYPES = ['sick', 'annual', 'acc', 'other'];

router.get('/', (req, res) => {
  const { employee_id } = req.query;
  let rows;
  if (employee_id) {
    rows = db.prepare('SELECT * FROM leave_periods WHERE employee_id = ? ORDER BY start_date').all(Number(employee_id));
  } else {
    rows = db.prepare('SELECT * FROM leave_periods ORDER BY start_date').all();
  }
  res.json(rows);
});

router.post('/', requireWrite, (req, res) => {
  const { employee_id, type, start_date, end_date, notes } = req.body;
  if (!employee_id) return res.status(400).json({ error: 'employee_id is required' });
  if (!start_date || !end_date) return res.status(400).json({ error: 'start_date and end_date are required' });
  if (type != null && !LEAVE_TYPES.includes(type)) return res.status(400).json({ error: 'invalid leave type' });

  const result = db
    .prepare(
      `INSERT INTO leave_periods (employee_id, type, start_date, end_date, notes)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(employee_id, type || 'annual', start_date, end_date, notes || null);

  const row = db.prepare('SELECT * FROM leave_periods WHERE id = ?').get(result.lastInsertRowid);
  broadcast('leave');
  res.status(201).json(row);
});

router.put('/:id', requireWrite, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM leave_periods WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'not found' });

  const { employee_id, type, start_date, end_date, notes } = req.body;
  if (type != null && !LEAVE_TYPES.includes(type)) return res.status(400).json({ error: 'invalid leave type' });

  db.prepare(
    `UPDATE leave_periods SET
       employee_id = ?, type = ?, start_date = ?, end_date = ?, notes = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    employee_id ?? existing.employee_id,
    type ?? existing.type,
    start_date ?? existing.start_date,
    end_date ?? existing.end_date,
    notes ?? existing.notes,
    id
  );

  const row = db.prepare('SELECT * FROM leave_periods WHERE id = ?').get(id);
  broadcast('leave');
  res.json(row);
});

router.delete('/:id', requireWrite, (req, res) => {
  const id = Number(req.params.id);
  db.prepare('DELETE FROM leave_periods WHERE id = ?').run(id);
  broadcast('leave');
  res.status(204).end();
});

export default router;
