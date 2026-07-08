import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import './db/index.js';
import './db/seed.js';

import employeesRouter from './routes/employees.js';
import jobsRouter from './routes/jobs.js';
import phasesRouter from './routes/phases.js';
import assignmentsRouter from './routes/assignments.js';
import timelineRouter from './routes/timeline.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.use('/api/employees', employeesRouter);
app.use('/api/jobs', jobsRouter);
app.use('/api/phases', phasesRouter);
app.use('/api/assignments', assignmentsRouter);
app.use('/api/timeline', timelineRouter);

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Serve the built client (production) if it exists, so the whole app can run
// from a single Node process on one machine for the whole office to reach.
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/(.*)/, (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'internal error' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`WRS Scheduler server listening on http://0.0.0.0:${PORT}`);
});
