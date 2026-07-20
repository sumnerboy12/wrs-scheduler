import db from '../db/index.js';

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const DEFAULT_SUBJECT_TEMPLATE = 'Your Rostr schedule: {{start_date}} – {{end_date}}';
export const DEFAULT_BODY_TEMPLATE = `Hi {{first_name}},

Here's what you're booked on for {{start_date}} – {{end_date}}:

{{bookings}}

— Rostr`;

// Parsed as local calendar values (not through Date-with-timezone parsing)
// so a stored '2026-07-20' always reads as the 20th regardless of the
// server's own timezone offset.
function parseISODate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDate(iso) {
  const date = parseISODate(iso);
  const d = date.getDate();
  const m = date.getMonth();
  return `${WEEKDAY[date.getDay()]} ${d} ${MONTH[m]}`;
}

// Every active employee's bookings that overlap [startDate, endDate], each
// with the job/phase names attached — the shared query behind both the
// preview screen and the actual send, so what an admin previews is exactly
// what goes out.
export function buildWeeklySummaries(startDate, endDate) {
  const employees = db.prepare('SELECT * FROM employees WHERE active = 1 ORDER BY name').all();

  const assignmentStmt = db.prepare(
    `SELECT a.*, p.name AS phase_name, j.name AS job_name, j.code AS job_code
     FROM assignments a
     JOIN phases p ON p.id = a.phase_id
     JOIN jobs j ON j.id = p.job_id
     WHERE a.employee_id = ? AND a.start_date <= ? AND a.end_date >= ?
     ORDER BY a.start_date`
  );

  return employees.map((employee) => {
    const items = assignmentStmt.all(employee.id, endDate, startDate);
    return { employee, items };
  });
}

export function getTemplate() {
  const rows = db
    .prepare("SELECT key, value FROM settings WHERE key IN ('summary_email_subject', 'summary_email_body')")
    .all();
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    subject: byKey.summary_email_subject ?? DEFAULT_SUBJECT_TEMPLATE,
    body: byKey.summary_email_body ?? DEFAULT_BODY_TEMPLATE,
  };
}

export function saveTemplate({ subject, body }) {
  const upsert = db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value`
  );
  upsert.run('summary_email_subject', subject);
  upsert.run('summary_email_body', body);
  return getTemplate();
}

// Sentinel pushed into the rows list at each calendar-week boundary so
// renderTable can draw a full-width divider there instead of a data row.
const WEEK_SEPARATOR = Symbol('week-separator');

// Fixed-width plain-text table — aligns cleanly in any monospace-rendered
// plain-text email client (which is effectively all of them) without
// needing an HTML body.
function renderTable(headers, rows) {
  const dataRows = rows.filter((r) => r !== WEEK_SEPARATOR);
  const widths = headers.map((h, i) => Math.max(h.length, ...dataRows.map((r) => r[i].length)));
  const formatRow = (cells) => cells.map((c, i) => c.padEnd(widths[i])).join('  ').trimEnd();
  const headerSeparator = widths.map((w) => '-'.repeat(w)).join('  ');
  const weekSeparator = widths.map((w) => '-'.repeat(w)).join('  ');
  const body = rows.map((row) => (row === WEEK_SEPARATOR ? weekSeparator : formatRow(row)));
  return [formatRow(headers), headerSeparator, ...body].join('\n');
}

// One row per calendar day in the range (not one row per assignment) — an
// assignment spanning three weeks would otherwise show its full span on
// every day's summary; this instead answers "where am I on THIS day". A
// day someone's split across more than one job gets one row per job, with
// the day repeated on each so the table still reads correctly row by row.
// Saturday/Sunday rows are skipped unless includeWeekends is on — the
// selected date range can still span a weekend either way (e.g. Next
// week is always Mon–Sun); this only controls whether those days show up
// in the table.
// A divider is drawn at each Mon–Sun week boundary, but only once the
// range actually crosses one — a single week never gets a divider.
function renderBookings(items, startDate, endDate, includeWeekends) {
  const rows = [];
  const end = parseISODate(endDate);
  for (let cursor = parseISODate(startDate); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    const dayOfWeek = cursor.getDay(); // 0 = Sunday, 6 = Saturday
    if (!includeWeekends && (dayOfWeek === 0 || dayOfWeek === 6)) continue;
    if (dayOfWeek === 1 && rows.length > 0) rows.push(WEEK_SEPARATOR);

    const iso = toISODate(cursor);
    const day = formatDate(iso);
    const dayItems = items.filter((item) => item.start_date <= iso && item.end_date >= iso);

    if (dayItems.length === 0) {
      rows.push([day, 'Nothing scheduled', '']);
    } else {
      for (const item of dayItems) {
        const allocation = item.allocation_pct < 100 ? ` (${item.allocation_pct}%)` : '';
        rows.push([day, item.job_name, `${item.phase_name}${allocation}`]);
      }
    }
  }
  return renderTable(['Day', 'Job', 'Phase'], rows);
}

// {{placeholder}} substitution — deliberately simple (no loops/conditionals
// in the template itself) so the admin-editable part stays a plain string;
// {{bookings}} is the one placeholder that expands to a whole pre-rendered
// block rather than a single value.
function interpolate(template, values) {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => (key in values ? values[key] : match));
}

export function formatSummaryEmail(employee, items, startDate, endDate, template = getTemplate(), includeWeekends = false) {
  const values = {
    first_name: employee.name.split(' ')[0],
    full_name: employee.name,
    start_date: formatDate(startDate),
    end_date: formatDate(endDate),
    bookings: renderBookings(items, startDate, endDate, includeWeekends),
  };

  return {
    subject: interpolate(template.subject, values),
    text: interpolate(template.body, values),
  };
}
