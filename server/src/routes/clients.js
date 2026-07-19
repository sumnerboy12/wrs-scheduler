import { Router } from 'express';
import db from '../db/index.js';

const router = Router();

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM clients ORDER BY name COLLATE NOCASE').all();
  res.json(rows);
});

router.post('/', (req, res) => {
  const { name, color, notes } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });

  const result = db
    .prepare('INSERT INTO clients (name, color, notes) VALUES (?, ?, ?)')
    .run(name.trim(), color || '#3b82f6', notes || null);

  const row = db.prepare('SELECT * FROM clients WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(row);
});

router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM clients WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'not found' });

  const { name, color, notes } = req.body;
  db.prepare(
    `UPDATE clients SET name = ?, color = ?, notes = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(name ?? existing.name, color ?? existing.color, notes ?? existing.notes, id);

  const row = db.prepare('SELECT * FROM clients WHERE id = ?').get(id);
  res.json(row);
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  // Jobs linked to this client are unlinked (client_id -> NULL) rather than
  // deleted, via the column's ON DELETE SET NULL — a client going away
  // shouldn't take its job history with it.
  db.prepare('DELETE FROM clients WHERE id = ?').run(id);
  res.status(204).end();
});

export default router;
