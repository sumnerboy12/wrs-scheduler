import { Router } from 'express';
import db from '../db/index.js';
import { requireWrite } from '../middleware/auth.js';

const router = Router();

router.put('/:id', requireWrite, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM phases WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'not found' });

  const { name, sequence, start_date, end_date, estimated_staff, notes } = req.body;
  db.prepare(
    `UPDATE phases SET
       name = ?, sequence = ?, start_date = ?, end_date = ?, estimated_staff = ?, notes = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    name ?? existing.name,
    sequence ?? existing.sequence,
    start_date ?? existing.start_date,
    end_date ?? existing.end_date,
    estimated_staff !== undefined ? estimated_staff : existing.estimated_staff,
    notes ?? existing.notes,
    id
  );

  const row = db.prepare('SELECT * FROM phases WHERE id = ?').get(id);
  res.json(row);
});

router.delete('/:id', requireWrite, (req, res) => {
  const id = Number(req.params.id);
  db.prepare('DELETE FROM phases WHERE id = ?').run(id);
  res.status(204).end();
});

export default router;
