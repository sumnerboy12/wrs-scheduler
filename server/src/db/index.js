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

export { dataDir };
export default db;
