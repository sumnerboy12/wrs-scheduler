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

export { nextWeekRange, currentWeekKey } from './emailDates.js';

const LEAVE_TYPE_LABELS = { sick: 'Sick', annual: 'Annual', acc: 'ACC', other: 'Other' };

export const DEFAULT_SUBJECT_TEMPLATE = 'Your Rostr schedule: {{start_date}} – {{end_date}}';
export const DEFAULT_BODY_TEMPLATE = `Hi {{first_name}},

Here's what you're booked on for {{start_date}} – {{end_date}}:

{{bookings}}

— Rostr`;

// Every active employee's bookings and leave that overlap [startDate,
// endDate] — the shared query behind both the preview screen and the
// actual send, so what an admin previews is exactly what goes out.
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
  const leaveStmt = db.prepare(
    `SELECT * FROM leave_periods WHERE employee_id = ? AND start_date <= ? AND end_date >= ? ORDER BY start_date`
  );

  return employees.map((employee) => {
    const items = assignmentStmt.all(employee.id, endDate, startDate);
    const leave = leaveStmt.all(employee.id, endDate, startDate);
    return { employee, items, leave };
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

// One row per calendar day in the range (not one row per assignment) — an
// assignment spanning three weeks would otherwise show its full span on
// every day's summary; this instead answers "where am I on THIS day". A
// day someone's split across more than one job gets one row per job, with
// the day repeated on each so the table still reads correctly row by row.
// Leave gets its own row too (Job column reads "Leave", Phase column
// carries the leave type) — pushed ahead of any job rows so it's the first
// thing they see, and shown even alongside a job row on the same day
// rather than one replacing the other: that combination is exactly the
// "booked while on leave" conflict flagged elsewhere, and hiding either
// side of it here would bury the thing they most need to notice.
function buildBookingRows(items, leave, startDate, endDate, includeWeekends) {
  return buildDayRows(startDate, endDate, includeWeekends, (day, iso, rows) => {
    const dayItems = items.filter((item) => item.start_date <= iso && item.end_date >= iso);
    const dayLeave = leave.filter((l) => l.start_date <= iso && l.end_date >= iso);

    if (dayItems.length === 0 && dayLeave.length === 0) {
      rows.push([day, 'Nothing scheduled', '']);
      return;
    }
    for (const l of dayLeave) {
      rows.push([day, 'Leave', LEAVE_TYPE_LABELS[l.type] ?? l.type]);
    }
    for (const item of dayItems) {
      const allocation = item.allocation_pct < 100 ? ` (${item.allocation_pct}%)` : '';
      rows.push([day, item.job_name, `${item.phase_name}${allocation}`]);
    }
  });
}

const BOOKING_HEADERS = ['Day', 'Job', 'Phase'];

export function formatSummaryEmail(employee, items, leave, startDate, endDate, template = getTemplate(), includeWeekends = false) {
  const rows = buildBookingRows(items, leave, startDate, endDate, includeWeekends);
  const effectiveEndDate = includeWeekends ? endDate : lastWeekdayOnOrBefore(endDate);

  const values = {
    first_name: employee.name.split(' ')[0],
    full_name: employee.name,
    start_date: formatDate(startDate),
    end_date: formatDate(effectiveEndDate),
    bookings: renderDayTableText(BOOKING_HEADERS, rows),
  };

  const htmlValues = {
    first_name: escapeHtml(values.first_name),
    full_name: escapeHtml(values.full_name),
    start_date: escapeHtml(values.start_date),
    end_date: escapeHtml(values.end_date),
    bookings: renderDayTableHtml(BOOKING_HEADERS, rows),
  };

  const htmlBody = interpolate(escapeHtml(template.body), htmlValues).replace(/\n/g, '<br>');

  return {
    subject: interpolate(template.subject, values),
    text: interpolate(template.body, values),
    html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;">${htmlBody}</div>`,
  };
}
