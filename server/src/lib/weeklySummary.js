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

// Monday of the calendar week containing `date`.
function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sunday
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  d.setHours(0, 0, 0, 0);
  return d;
}

// Monday–Sunday of next calendar week — the range the auto-send job emails
// out, mirroring the client's own "Next week" shortcut.
export function nextWeekRange() {
  const nextMonday = startOfWeek(new Date());
  nextMonday.setDate(nextMonday.getDate() + 7);
  const sunday = new Date(nextMonday);
  sunday.setDate(sunday.getDate() + 6);
  return { start: toISODate(nextMonday), end: toISODate(sunday) };
}

// Identifies "this calendar week" (as the ISO date of its Monday) so the
// scheduler can tell whether it's already sent this week's batch, even if
// it gets checked many times on send day before the next week rolls over.
export function currentWeekKey(date = new Date()) {
  return toISODate(startOfWeek(date));
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

const DEFAULT_AUTO_SEND_DAY = 5; // Friday (Date#getDay() convention: 0 = Sunday)
const DEFAULT_AUTO_SEND_TIME = '15:00';

export function getAutoSendConfig() {
  const rows = db
    .prepare(
      `SELECT key, value FROM settings WHERE key IN (
         'summary_auto_send_enabled', 'summary_auto_send_day', 'summary_auto_send_time', 'summary_auto_send_include_weekends'
       )`
    )
    .all();
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    enabled: byKey.summary_auto_send_enabled === 'true',
    dayOfWeek: byKey.summary_auto_send_day != null ? Number(byKey.summary_auto_send_day) : DEFAULT_AUTO_SEND_DAY,
    time: byKey.summary_auto_send_time ?? DEFAULT_AUTO_SEND_TIME,
    includeWeekends: byKey.summary_auto_send_include_weekends === 'true',
  };
}

export function saveAutoSendConfig({ enabled, dayOfWeek, time, includeWeekends }) {
  const upsert = db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value`
  );
  upsert.run('summary_auto_send_enabled', String(Boolean(enabled)));
  upsert.run('summary_auto_send_day', String(dayOfWeek));
  upsert.run('summary_auto_send_time', time);
  upsert.run('summary_auto_send_include_weekends', String(Boolean(includeWeekends)));
  return getAutoSendConfig();
}

// Tracks the calendar week (see currentWeekKey) the auto-send job last
// actually ran for, so the scheduler's periodic check doesn't re-send the
// same week's batch every time it ticks after the scheduled time.
export function getAutoSendLastRunWeek() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'summary_auto_send_last_run'").get();
  return row ? row.value : null;
}

export function setAutoSendLastRunWeek(weekKey) {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES ('summary_auto_send_last_run', ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value`
  ).run(weekKey);
}

// Sentinel pushed into the rows list at each calendar-week boundary so the
// table renderers can draw a full-width divider there instead of a data row.
const WEEK_SEPARATOR = Symbol('week-separator');

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
// range actually crosses one — a single week never gets a divider. Shared
// by both the plain-text and HTML renderers so they never drift apart.
function buildBookingRows(items, startDate, endDate, includeWeekends) {
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
  return rows;
}

// Fixed-width plain-text table — this is only a reasonable fallback for
// clients that render the plain-text part in a monospace font. Most (e.g.
// Outlook) don't, so it's no longer the primary rendering — see
// renderBookingsHtml below — but it's kept as the multipart/alternative
// text version for clients that can't render HTML at all.
function renderBookingsText(rows) {
  const headers = ['Day', 'Job', 'Phase'];
  const dataRows = rows.filter((r) => r !== WEEK_SEPARATOR);
  const widths = headers.map((h, i) => Math.max(h.length, ...dataRows.map((r) => r[i].length)));
  const formatRow = (cells) => cells.map((c, i) => c.padEnd(widths[i])).join('  ').trimEnd();
  const headerSeparator = widths.map((w) => '-'.repeat(w)).join('  ');
  const body = rows.map((row) => (row === WEEK_SEPARATOR ? headerSeparator : formatRow(row)));
  return [formatRow(headers), headerSeparator, ...body].join('\n');
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Real HTML <table> — unlike the plain-text version, its column alignment
// doesn't depend on the recipient's client using a monospace font (Outlook
// in particular renders plain text proportionally, which breaks the padded
// column approach entirely).
function renderBookingsHtml(rows) {
  const cell = (text, extra = '') =>
    `<td style="padding:4px 12px 4px 0;border-bottom:1px solid #e2e2e2;${extra}">${escapeHtml(text)}</td>`;
  const headerCell = (text) =>
    `<th style="padding:4px 12px 4px 0;border-bottom:2px solid #333;text-align:left;">${escapeHtml(text)}</th>`;
  const body = rows
    .map((row) =>
      row === WEEK_SEPARATOR
        ? '<tr><td colspan="3" style="padding:6px 0;border-bottom:2px solid #333;"></td></tr>'
        : `<tr>${cell(row[0])}${cell(row[1])}${cell(row[2])}</tr>`
    )
    .join('');
  return (
    `<table style="border-collapse:collapse;font-family:Arial,Helvetica,sans-serif;font-size:14px;">` +
    `<thead><tr>${headerCell('Day')}${headerCell('Job')}${headerCell('Phase')}</tr></thead>` +
    `<tbody>${body}</tbody></table>`
  );
}

// {{placeholder}} substitution — deliberately simple (no loops/conditionals
// in the template itself) so the admin-editable part stays a plain string;
// {{bookings}} is the one placeholder that expands to a whole pre-rendered
// block rather than a single value.
function interpolate(template, values) {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => (key in values ? values[key] : match));
}

export function formatSummaryEmail(employee, items, startDate, endDate, template = getTemplate(), includeWeekends = false) {
  const rows = buildBookingRows(items, startDate, endDate, includeWeekends);

  const values = {
    first_name: employee.name.split(' ')[0],
    full_name: employee.name,
    start_date: formatDate(startDate),
    end_date: formatDate(endDate),
    bookings: renderBookingsText(rows),
  };

  const htmlValues = {
    first_name: escapeHtml(values.first_name),
    full_name: escapeHtml(values.full_name),
    start_date: escapeHtml(values.start_date),
    end_date: escapeHtml(values.end_date),
    bookings: renderBookingsHtml(rows),
  };

  const htmlBody = interpolate(escapeHtml(template.body), htmlValues).replace(/\n/g, '<br>');

  return {
    subject: interpolate(template.subject, values),
    text: interpolate(template.body, values),
    html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;">${htmlBody}</div>`,
  };
}
