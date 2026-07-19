import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'scheduler.db');
const db = new DatabaseSync(dbPath);

db.exec('PRAGMA foreign_keys = ON');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// Migrations for columns added after a database file already existed —
// CREATE TABLE IF NOT EXISTS above won't retrofit these onto old files.
const jobColumns = db.prepare('PRAGMA table_info(jobs)').all().map((c) => c.name);
if (!jobColumns.includes('code')) {
  db.exec('ALTER TABLE jobs ADD COLUMN code TEXT');
}

const phaseColumns = db.prepare('PRAGMA table_info(phases)').all().map((c) => c.name);
if (!phaseColumns.includes('estimated_staff')) {
  db.exec('ALTER TABLE phases ADD COLUMN estimated_staff INTEGER');
}

// Jobs used to carry their own free-text client_name + colour; both moved
// onto a proper clients table (name/colour/notes) that jobs link to via
// client_id, so a client's colour only has to be set in one place. Migrate
// any existing rows before dropping the old columns.
if (!jobColumns.includes('client_id')) {
  db.exec('ALTER TABLE jobs ADD COLUMN client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL');
}
if (jobColumns.includes('client_name')) {
  const distinctClients = db
    .prepare("SELECT DISTINCT client_name FROM jobs WHERE client_name IS NOT NULL AND trim(client_name) <> ''")
    .all();
  const firstColorForClient = db.prepare(
    'SELECT color FROM jobs WHERE client_name = ? ORDER BY id LIMIT 1'
  );
  const insertClient = db.prepare('INSERT INTO clients (name, color) VALUES (?, ?)');
  const linkJobsToClient = db.prepare('UPDATE jobs SET client_id = ? WHERE client_name = ?');
  for (const { client_name } of distinctClients) {
    const color = firstColorForClient.get(client_name)?.color ?? '#3b82f6';
    const { lastInsertRowid } = insertClient.run(client_name, color);
    linkJobsToClient.run(lastInsertRowid, client_name);
  }
  db.exec('ALTER TABLE jobs DROP COLUMN client_name');
}
if (jobColumns.includes('color')) {
  db.exec('ALTER TABLE jobs DROP COLUMN color');
}

// Created here rather than in schema.sql: on an existing database, the
// index would run in the same schema.exec() pass as CREATE TABLE IF NOT
// EXISTS jobs — which is a no-op on a table that already exists — so
// client_id wouldn't exist as a column yet at that point.
db.exec('CREATE INDEX IF NOT EXISTS idx_jobs_client ON jobs(client_id)');

export { dataDir };
export default db;
