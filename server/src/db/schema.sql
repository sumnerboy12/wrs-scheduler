CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  role TEXT,
  email TEXT,
  phone TEXT,
  color TEXT NOT NULL DEFAULT '#4f7cff',
  active INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#3b82f6',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT,
  name TEXT NOT NULL,
  client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  address TEXT,
  status TEXT NOT NULL DEFAULT 'pipeline'
    CHECK (status IN ('pipeline','quoted','confirmed','in_progress','on_hold','complete','lost')),
  probability INTEGER,
  -- Who gets the weekly "crew on this job" email (see Summaries) — optional,
  -- and distinct from the client: the supervisor is one of your own
  -- employees, not the customer.
  supervisor_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS phases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sequence INTEGER NOT NULL DEFAULT 0,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  -- Rough headcount estimate for pipeline/quoted jobs, before any real
  -- employee is assigned — lets a quote be sanity-checked against total
  -- capacity without committing specific people to unconfirmed work.
  estimated_staff INTEGER,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phase_id INTEGER NOT NULL REFERENCES phases(id) ON DELETE CASCADE,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  allocation_pct INTEGER NOT NULL DEFAULT 100,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- An employee being unavailable — separate from assignments (which are
-- always against a job's phase) since leave isn't tied to any job.
CREATE TABLE IF NOT EXISTS leave_periods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'annual' CHECK (type IN ('sick', 'annual', 'acc', 'other')),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- An employee doing real work that isn't chargeable to any job (training,
-- admin, internal meetings) — unlike leave, they're present and it counts
-- toward their allocation the same way a job assignment does (see
-- lib/conflicts.js), it's just not tied to a phase.
CREATE TABLE IF NOT EXISTS non_billable_periods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT 'admin' CHECK (category IN ('training', 'admin', 'meeting', 'other')),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  allocation_pct INTEGER NOT NULL DEFAULT 100,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('admin', 'editor', 'readonly')),
  active INTEGER NOT NULL DEFAULT 1,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  -- When set, this account can only sign in via SSO (see lib/oidc.js) —
  -- the password_hash still exists (kept simple, always required at
  -- creation) but /auth/login refuses to check it while this is on.
  sso_only INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Generic key/value store for small bits of app config (currently just the
-- summary email template) — not worth a dedicated table per setting.
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_phases_job ON phases(job_id);
CREATE INDEX IF NOT EXISTS idx_assignments_phase ON assignments(phase_id);
CREATE INDEX IF NOT EXISTS idx_assignments_employee ON assignments(employee_id);
CREATE INDEX IF NOT EXISTS idx_assignments_dates ON assignments(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_leave_periods_employee ON leave_periods(employee_id);
CREATE INDEX IF NOT EXISTS idx_leave_periods_dates ON leave_periods(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_non_billable_employee ON non_billable_periods(employee_id);
CREATE INDEX IF NOT EXISTS idx_non_billable_dates ON non_billable_periods(start_date, end_date);
