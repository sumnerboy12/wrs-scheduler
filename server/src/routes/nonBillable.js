import { Router } from 'express';
import db from '../db/index.js';
import { requireWrite } from '../middleware/auth.js';
import { broadcast } from '../lib/events.js';

const router = Router();

const NON_BILLABLE_CATEGORIES = ['training', 'admin', 'meeting', 'other'];

router.get('/', (req, res) => {
  const { employee_id } = req.query;
  let rows;
  if (employee_id) {
    rows = db.prepare('SELECT * FROM non_billable_periods WHERE employee_id = ? ORDER BY start_date').all(Number(employee_id));
  } else {
    rows = db.prepare('SELECT * FROM non_billable_periods ORDER BY start_date').all();
  }
  res.json(rows);
});

router.post('/', requireWrite, (req, res) => {
  const { employee_id, category, start_date, end_date, allocation_pct, notes } = req.body;
  if (!employee_id) return res.status(400).json({ error: 'employee_id is required' });
  if (!start_date || !end_date) return res.status(400).json({ error: 'start_date and end_date are required' });
  if (category != null && !NON_BILLABLE_CATEGORIES.includes(category)) return res.status(400).json({ error: 'invalid category' });

  const result = db
    .prepare(
      `INSERT INTO non_billable_periods (employee_id, category, start_date, end_date, allocation_pct, notes)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(employee_id, category || 'admin', start_date, end_date, allocation_pct ?? 100, notes || null);

  const row = db.prepare('SELECT * FROM non_billable_periods WHERE id = ?').get(result.lastInsertRowid);
  broadcast('nonBillable');
  res.status(201).json(row);
});

router.put('/:id', requireWrite, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM non_billable_periods WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'not found' });

  const { employee_id, category, start_date, end_date, allocation_pct, notes } = req.body;
  if (category != null && !NON_BILLABLE_CATEGORIES.includes(category)) return res.status(400).json({ error: 'invalid category' });

  db.prepare(
    `UPDATE non_billable_periods SET
       employee_id = ?, category = ?, start_date = ?, end_date = ?, allocation_pct = ?, notes = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    employee_id ?? existing.employee_id,
    category ?? existing.category,
    start_date ?? existing.start_date,
    end_date ?? existing.end_date,
    allocation_pct ?? existing.allocation_pct,
    notes ?? existing.notes,
    id
  );

  const row = db.prepare('SELECT * FROM non_billable_periods WHERE id = ?').get(id);
  broadcast('nonBillable');
  res.json(row);
});

router.delete('/:id', requireWrite, (req, res) => {
  const id = Number(req.params.id);
  db.prepare('DELETE FROM non_billable_periods WHERE id = ?').run(id);
  broadcast('nonBillable');
  res.status(204).end();
});

export default router;
