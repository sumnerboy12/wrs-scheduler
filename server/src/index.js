import express from 'express';
import cors from 'cors';
import session from 'express-session';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { dataDir } from './db/index.js';
import './db/seed.js';
import './db/seedAdmin.js';

import { requireAuth } from './middleware/auth.js';
import authRouter from './routes/auth.js';
import usersRouter from './routes/users.js';
import clientsRouter from './routes/clients.js';
import employeesRouter from './routes/employees.js';
import jobsRouter from './routes/jobs.js';
import phasesRouter from './routes/phases.js';
import assignmentsRouter from './routes/assignments.js';
import timelineRouter from './routes/timeline.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 4000;

// Persisted so sessions aren't all invalidated by a server restart.
const secretPath = path.join(dataDir, 'session-secret');
if (!fs.existsSync(secretPath)) fs.writeFileSync(secretPath, crypto.randomBytes(32).toString('hex'));
const sessionSecret = fs.readFileSync(secretPath, 'utf8').trim();

app.use(cors());
app.use(express.json());
app.use(
  session({
    secret: sessionSecret,
    name: 'rostr.sid',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', maxAge: 30 * 24 * 60 * 60 * 1000 },
  })
);

app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);

app.use('/api/clients', requireAuth, clientsRouter);
app.use('/api/employees', requireAuth, employeesRouter);
app.use('/api/jobs', requireAuth, jobsRouter);
app.use('/api/phases', requireAuth, phasesRouter);
app.use('/api/assignments', requireAuth, assignmentsRouter);
app.use('/api/timeline', requireAuth, timelineRouter);

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
  console.log(`Rostr server listening on http://0.0.0.0:${PORT}`);
});
