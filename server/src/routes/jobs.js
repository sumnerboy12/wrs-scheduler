import { Router } from 'express';
import db from '../db/index.js';

const router = Router();

router.get('/', (req, res) => {
  const { status } = req.query;
  let rows;
  if (status) {
    rows = db.prepare('SELECT * FROM jobs WHERE status = ? ORDER BY created_at DESC').all(status);
  } else {
    rows = db.prepare('SELECT * FROM jobs ORDER BY created_at DESC').all();
  }
  res.json(rows);
});

router.get('/:id', (req, res) => {
  const id = Number(req.params.id);
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(id);
  if (!job) return res.status(404).json({ error: 'not found' });
  const phases = db.prepare('SELECT * FROM phases WHERE job_id = ? ORDER BY sequence, start_date').all(id);
  res.json({ ...job, phases });
});

router.post('/', (req, res) => {
  const { name, client_name, address, status, probability, color, notes } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });

  const result = db
    .prepare(
      `INSERT INTO jobs (name, client_name, address, status, probability, color, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      name.trim(),
      client_name || null,
      address || null,
      status || 'pipeline',
      probability ?? null,
      color || '#2e9e5b',
      notes || null
    );

  const row = db.prepare('SELECT * FROM jobs WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(row);
});

router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM jobs WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'not found' });

  const { name, client_name, address, status, probability, color, notes } = req.body;
  db.prepare(
    `UPDATE jobs SET
       name = ?, client_name = ?, address = ?, status = ?, probability = ?, color = ?, notes = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    name ?? existing.name,
    client_name ?? existing.client_name,
    address ?? existing.address,
    status ?? existing.status,
    probability ?? existing.probability,
    color ?? existing.color,
    notes ?? existing.notes,
    id
  );

  const row = db.prepare('SELECT * FROM jobs WHERE id = ?').get(id);
  res.json(row);
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  db.prepare('DELETE FROM jobs WHERE id = ?').run(id);
  res.status(204).end();
});

// --- Phases nested under a job ---

router.get('/:jobId/phases', (req, res) => {
  const jobId = Number(req.params.jobId);
  const rows = db.prepare('SELECT * FROM phases WHERE job_id = ? ORDER BY sequence, start_date').all(jobId);
  res.json(rows);
});

router.post('/:jobId/phases', (req, res) => {
  const jobId = Number(req.params.jobId);
  const job = db.prepare('SELECT id FROM jobs WHERE id = ?').get(jobId);
  if (!job) return res.status(404).json({ error: 'job not found' });

  const { name, sequence, start_date, end_date, notes } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
  if (!start_date || !end_date) return res.status(400).json({ error: 'start_date and end_date are required' });

  const result = db
    .prepare(
      `INSERT INTO phases (job_id, name, sequence, start_date, end_date, notes)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(jobId, name.trim(), sequence ?? 0, start_date, end_date, notes || null);

  const row = db.prepare('SELECT * FROM phases WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(row);
});

export default router;
