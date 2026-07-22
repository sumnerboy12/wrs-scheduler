import { Router } from 'express';
import db from '../db/index.js';
import { computeConflictIds } from '../lib/conflicts.js';
import { requireWrite } from '../middleware/auth.js';
import { broadcast } from '../lib/events.js';

const router = Router();

router.get('/', (req, res) => {
  const { employee_id } = req.query;
  let rows;
  if (employee_id) {
    rows = db.prepare('SELECT * FROM assignments WHERE employee_id = ? ORDER BY start_date').all(Number(employee_id));
  } else {
    rows = db.prepare('SELECT * FROM assignments ORDER BY start_date').all();
  }
  const leave = employee_id
    ? db.prepare('SELECT * FROM leave_periods WHERE employee_id = ?').all(Number(employee_id))
    : db.prepare('SELECT * FROM leave_periods').all();
  const nonBillable = employee_id
    ? db.prepare('SELECT * FROM non_billable_periods WHERE employee_id = ?').all(Number(employee_id))
    : db.prepare('SELECT * FROM non_billable_periods').all();
  // Same exclusion as the timeline endpoint — a completed phase's booking
  // no longer competes for capacity, so it shouldn't be flagged and
  // shouldn't count against anyone else's allocation either.
  const completedPhaseIds = new Set(db.prepare('SELECT id FROM phases WHERE complete = 1').all().map((p) => p.id));
  const conflictCandidates = rows.filter((r) => !completedPhaseIds.has(r.phase_id));
  const { assignmentConflictIds } = computeConflictIds(conflictCandidates, leave, nonBillable);
  res.json(rows.map((r) => ({ ...r, conflict: assignmentConflictIds.has(r.id) })));
});

router.post('/', requireWrite, (req, res) => {
  const { phase_id, employee_id, start_date, end_date, allocation_pct, notes } = req.body;
  if (!phase_id || !employee_id) return res.status(400).json({ error: 'phase_id and employee_id are required' });
  if (!start_date || !end_date) return res.status(400).json({ error: 'start_date and end_date are required' });

  const result = db
    .prepare(
      `INSERT INTO assignments (phase_id, employee_id, start_date, end_date, allocation_pct, notes)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(phase_id, employee_id, start_date, end_date, allocation_pct ?? 100, notes || null);

  const row = db.prepare('SELECT * FROM assignments WHERE id = ?').get(result.lastInsertRowid);
  broadcast('assignments');
  res.status(201).json(row);
});

router.put('/:id', requireWrite, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM assignments WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'not found' });

  const { phase_id, employee_id, start_date, end_date, allocation_pct, notes } = req.body;
  db.prepare(
    `UPDATE assignments SET
       phase_id = ?, employee_id = ?, start_date = ?, end_date = ?, allocation_pct = ?, notes = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    phase_id ?? existing.phase_id,
    employee_id ?? existing.employee_id,
    start_date ?? existing.start_date,
    end_date ?? existing.end_date,
    allocation_pct ?? existing.allocation_pct,
    notes ?? existing.notes,
    id
  );

  const row = db.prepare('SELECT * FROM assignments WHERE id = ?').get(id);
  broadcast('assignments');
  res.json(row);
});

router.delete('/:id', requireWrite, (req, res) => {
  const id = Number(req.params.id);
  db.prepare('DELETE FROM assignments WHERE id = ?').run(id);
  broadcast('assignments');
  res.status(204).end();
});

export default router;
