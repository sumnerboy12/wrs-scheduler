import db from '../db/index.js';
import {
  formatDate,
  escapeHtml,
  interpolate,
  buildDayRows,
  renderDayTableText,
  renderDayTableHtml,
  lastWeekdayOnOrBefore,
} from './emailDates.js';

export const DEFAULT_JOB_SUBJECT_TEMPLATE = 'Crew for {{job_name}}: {{start_date}} – {{end_date}}';
export const DEFAULT_JOB_BODY_TEMPLATE = `Hi {{supervisor_first_name}},

Here's who's booked on {{job_name}} for {{start_date}} – {{end_date}}:

{{crew}}

— Rostr`;

// Every job with a supervisor set, and its crew (assignments on any of its
// phases) overlapping [startDate, endDate] — the shared query behind both
// the preview screen and the actual send. Excludes On Hold/Complete/Lost
// jobs, mirroring the "Active" status filter used on the Schedule and Jobs
// screens — a supervisor doesn't need pinging about parked or closed-out work.
export function buildJobCrewSummaries(startDate, endDate) {
  const jobs = db
    .prepare(
      `SELECT j.*, e.name AS supervisor_name, e.email AS supervisor_email
       FROM jobs j
       JOIN employees e ON e.id = j.supervisor_id
       WHERE j.supervisor_id IS NOT NULL AND j.status NOT IN ('on_hold', 'complete', 'lost')
       ORDER BY j.name COLLATE NOCASE`
    )
    .all();

  const assignmentStmt = db.prepare(
    `SELECT a.*, p.name AS phase_name, emp.name AS employee_name
     FROM assignments a
     JOIN phases p ON p.id = a.phase_id
     JOIN employees emp ON emp.id = a.employee_id
     WHERE p.job_id = ? AND a.start_date <= ? AND a.end_date >= ?
     ORDER BY p.sequence, p.start_date, emp.name COLLATE NOCASE`
  );

  return jobs.map((job) => {
    const items = assignmentStmt.all(job.id, endDate, startDate);
    return { job, items };
  });
}

export function getJobTemplate() {
  const rows = db
    .prepare("SELECT key, value FROM settings WHERE key IN ('summary_job_email_subject', 'summary_job_email_body')")
    .all();
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    subject: byKey.summary_job_email_subject ?? DEFAULT_JOB_SUBJECT_TEMPLATE,
    body: byKey.summary_job_email_body ?? DEFAULT_JOB_BODY_TEMPLATE,
  };
}

export function saveJobTemplate({ subject, body }) {
  const upsert = db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value`
  );
  upsert.run('summary_job_email_subject', subject);
  upsert.run('summary_job_email_body', body);
  return getJobTemplate();
}

const DEFAULT_JOB_AUTO_SEND_DAY = 5; // Friday (Date#getDay() convention: 0 = Sunday)
const DEFAULT_JOB_AUTO_SEND_TIME = '15:00';

export function getJobAutoSendConfig() {
  const rows = db
    .prepare(
      `SELECT key, value FROM settings WHERE key IN (
         'summary_job_auto_send_enabled', 'summary_job_auto_send_day', 'summary_job_auto_send_time', 'summary_job_auto_send_include_weekends'
       )`
    )
    .all();
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    enabled: byKey.summary_job_auto_send_enabled === 'true',
    dayOfWeek: byKey.summary_job_auto_send_day != null ? Number(byKey.summary_job_auto_send_day) : DEFAULT_JOB_AUTO_SEND_DAY,
    time: byKey.summary_job_auto_send_time ?? DEFAULT_JOB_AUTO_SEND_TIME,
    includeWeekends: byKey.summary_job_auto_send_include_weekends === 'true',
  };
}

export function saveJobAutoSendConfig({ enabled, dayOfWeek, time, includeWeekends }) {
  const upsert = db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value`
  );
  upsert.run('summary_job_auto_send_enabled', String(Boolean(enabled)));
  upsert.run('summary_job_auto_send_day', String(dayOfWeek));
  upsert.run('summary_job_auto_send_time', time);
  upsert.run('summary_job_auto_send_include_weekends', String(Boolean(includeWeekends)));
  return getJobAutoSendConfig();
}

// Tracks the calendar week (see currentWeekKey) the job auto-send last
// actually ran for — kept separate from the employee auto-send's own
// last-run marker so the two schedules can't interfere with each other.
export function getJobAutoSendLastRunWeek() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'summary_job_auto_send_last_run'").get();
  return row ? row.value : null;
}

export function setJobAutoSendLastRunWeek(weekKey) {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES ('summary_job_auto_send_last_run', ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value`
  ).run(weekKey);
}

// One row per day, per phase that has anyone booked that day — every
// employee on that phase that day is combined into a single "Employees"
// cell (e.g. "Sam Lee, Alex Chu (50%)") rather than one row each, since a
// supervisor cares about "who's on this phase today," not a per-person
// timesheet. A day with no one booked on any phase gets a single "No one
// scheduled" row.
function buildCrewDayRows(items, startDate, endDate, includeWeekends) {
  return buildDayRows(startDate, endDate, includeWeekends, (day, iso, rows) => {
    const dayItems = items.filter((item) => item.start_date <= iso && item.end_date >= iso);
    if (dayItems.length === 0) {
      rows.push([day, 'No one scheduled', '']);
      return;
    }

    const byPhase = new Map();
    for (const item of dayItems) {
      const allocation = item.allocation_pct < 100 ? ` (${item.allocation_pct}%)` : '';
      const names = byPhase.get(item.phase_name) ?? [];
      names.push(`${item.employee_name}${allocation}`);
      byPhase.set(item.phase_name, names);
    }
    for (const [phaseName, names] of byPhase) {
      rows.push([day, phaseName, names.join(', ')]);
    }
  });
}

const CREW_HEADERS = ['Day', 'Phase', 'Employees'];

export function formatJobSummaryEmail(job, items, startDate, endDate, template = getJobTemplate(), includeWeekends = false) {
  const rows = buildCrewDayRows(items, startDate, endDate, includeWeekends);
  const effectiveEndDate = includeWeekends ? endDate : lastWeekdayOnOrBefore(endDate);

  const values = {
    supervisor_first_name: job.supervisor_name.split(' ')[0],
    supervisor_name: job.supervisor_name,
    job_name: job.name,
    job_code: job.code || '',
    start_date: formatDate(startDate),
    end_date: formatDate(effectiveEndDate),
    crew: renderDayTableText(CREW_HEADERS, rows),
  };

  const htmlValues = {
    supervisor_first_name: escapeHtml(values.supervisor_first_name),
    supervisor_name: escapeHtml(values.supervisor_name),
    job_name: escapeHtml(values.job_name),
    job_code: escapeHtml(values.job_code),
    start_date: escapeHtml(values.start_date),
    end_date: escapeHtml(values.end_date),
    crew: renderDayTableHtml(CREW_HEADERS, rows),
  };

  const htmlBody = interpolate(escapeHtml(template.body), htmlValues).replace(/\n/g, '<br>');

  return {
    subject: interpolate(template.subject, values),
    text: interpolate(template.body, values),
    html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;">${htmlBody}</div>`,
  };
}
