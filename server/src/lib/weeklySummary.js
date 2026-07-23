import db from '../db/index.js';
import {
  formatDate,
  escapeHtml,
  interpolate,
  buildDayRows,
  renderDayTableText,
  renderDayTableHtml,
  wrapEmailHtmlBody,
  lastWeekdayOnOrBefore,
  parseISODate,
  toISODate,
} from './emailDates.js';

export { nextWeekRange, currentWeekKey } from './emailDates.js';

const LEAVE_TYPE_LABELS = { sick: 'Sick', annual: 'Annual', acc: 'ACC', other: 'Other' };
const NON_BILLABLE_CATEGORY_LABELS = { training: 'Training', admin: 'Admin', meeting: 'Meeting', other: 'Other' };

export const DEFAULT_SUBJECT_TEMPLATE = 'Your Rostr schedule: {{start_date}} – {{end_date}}';
export const DEFAULT_BODY_TEMPLATE = `Hi {{first_name}},

Here's what you're booked on for {{start_date}} – {{end_date}}:

{{job_bookings}}

Job addresses:

{{job_addresses}}

— Rostr`;

// True if every day in [startDate, endDate] that the email would actually
// show is covered by at least one of the employee's leave periods —
// stitched together from more than one record if that's what it takes
// (e.g. sick leave running straight into annual leave). Weekends are
// skipped when includeWeekends is off, matching buildDayRows exactly —
// someone on leave Mon–Fri with nothing over the weekend is still "fully
// on leave" as far as the email is concerned, since the table never shows
// a weekend row for them to have anything else to say on.
function isFullyOnLeave(leave, startDate, endDate, includeWeekends) {
  const end = parseISODate(endDate);
  for (let cursor = parseISODate(startDate); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    const dayOfWeek = cursor.getDay(); // 0 = Sunday, 6 = Saturday
    if (!includeWeekends && (dayOfWeek === 0 || dayOfWeek === 6)) continue;
    const iso = toISODate(cursor);
    if (!leave.some((l) => l.start_date <= iso && l.end_date >= iso)) return false;
  }
  return true;
}

// Every active employee's bookings and leave that overlap [startDate,
// endDate] — the shared query behind both the preview screen and the
// actual send, so what an admin previews is exactly what goes out.
// Bookings on a phase marked complete are excluded — same reasoning as
// hiding them from the Schedule, an employee doesn't need a reminder about
// work that's already finished.
export function buildWeeklySummaries(startDate, endDate, includeWeekends = false) {
  const employees = db.prepare('SELECT * FROM employees WHERE active = 1 ORDER BY name').all();

  const assignmentStmt = db.prepare(
    `SELECT a.*, p.name AS phase_name, j.id AS job_id, j.name AS job_name, j.code AS job_code, j.address AS job_address
     FROM assignments a
     JOIN phases p ON p.id = a.phase_id
     JOIN jobs j ON j.id = p.job_id
     WHERE a.employee_id = ? AND a.start_date <= ? AND a.end_date >= ? AND p.complete = 0
     ORDER BY a.start_date`
  );
  const leaveStmt = db.prepare(
    `SELECT * FROM leave_periods WHERE employee_id = ? AND start_date <= ? AND end_date >= ? ORDER BY start_date`
  );
  const nonBillableStmt = db.prepare(
    `SELECT * FROM non_billable_periods WHERE employee_id = ? AND start_date <= ? AND end_date >= ? ORDER BY start_date`
  );

  return employees.map((employee) => {
    const items = assignmentStmt.all(employee.id, endDate, startDate);
    const leave = leaveStmt.all(employee.id, endDate, startDate);
    const nonBillable = nonBillableStmt.all(employee.id, endDate, startDate);
    const onLeaveFullPeriod = isFullyOnLeave(leave, startDate, endDate, includeWeekends);
    return { employee, items, leave, nonBillable, onLeaveFullPeriod };
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
// Non-billable time (training, admin, ...) gets its own row too — Job
// column reads the category, Phase column carries the allocation % if it's
// not the full day — between leave and job rows: still "at work" unlike
// leave, but not chargeable to a job either.
// Any note on the underlying assignment/leave/non-billable row rides along
// in its own trailing column — left blank when there isn't one, rather
// than omitting the column entirely, so the table's shape doesn't shift
// week to week.
function buildBookingRows(items, leave, nonBillable, startDate, endDate, includeWeekends) {
  return buildDayRows(startDate, endDate, includeWeekends, (day, iso, rows) => {
    const dayItems = items.filter((item) => item.start_date <= iso && item.end_date >= iso);
    const dayLeave = leave.filter((l) => l.start_date <= iso && l.end_date >= iso);
    const dayNonBillable = nonBillable.filter((n) => n.start_date <= iso && n.end_date >= iso);

    if (dayItems.length === 0 && dayLeave.length === 0 && dayNonBillable.length === 0) {
      rows.push([day, 'Nothing scheduled', '', '']);
      return;
    }
    for (const l of dayLeave) {
      rows.push([day, 'Leave', LEAVE_TYPE_LABELS[l.type] ?? l.type, l.notes || '']);
    }
    for (const n of dayNonBillable) {
      const allocation = n.allocation_pct < 100 ? `${n.allocation_pct}%` : '';
      rows.push([day, NON_BILLABLE_CATEGORY_LABELS[n.category] ?? n.category, allocation, n.notes || '']);
    }
    for (const item of dayItems) {
      const allocation = item.allocation_pct < 100 ? ` (${item.allocation_pct}%)` : '';
      rows.push([day, item.job_name, `${item.phase_name}${allocation}`, item.notes || '']);
    }
  });
}

const BOOKING_HEADERS = ['Day', 'Job', 'Phase', 'Notes'];
const JOB_ADDRESS_HEADERS = ['Job', 'Address'];

// One row per distinct job the employee is booked on this range that
// actually has an address on file (not per assignment/day) — a reference
// list for "where am I going", separate from the day-by-day table above.
// Deduped by job id since two jobs could share a name; jobs without an
// address are skipped entirely rather than shown with a blank cell, since
// an empty address isn't useful to list.
function buildJobAddressRows(items) {
  const byJobId = new Map();
  for (const item of items) {
    if (!item.job_address) continue;
    if (!byJobId.has(item.job_id)) byJobId.set(item.job_id, { job_name: item.job_name, address: item.job_address });
  }
  return Array.from(byJobId.values())
    .sort((a, b) => a.job_name.localeCompare(b.job_name))
    .map((j) => [j.job_name, j.address]);
}

export function formatSummaryEmail(
  employee,
  items,
  leave,
  nonBillable,
  startDate,
  endDate,
  template = getTemplate(),
  includeWeekends = false
) {
  const bookingRows = buildBookingRows(items, leave, nonBillable, startDate, endDate, includeWeekends);
  const addressRows = buildJobAddressRows(items);
  const effectiveEndDate = includeWeekends ? endDate : lastWeekdayOnOrBefore(endDate);

  const values = {
    first_name: employee.name.split(' ')[0],
    full_name: employee.name,
    start_date: formatDate(startDate),
    end_date: formatDate(effectiveEndDate),
    job_bookings: renderDayTableText(BOOKING_HEADERS, bookingRows),
    job_addresses: addressRows.length ? renderDayTableText(JOB_ADDRESS_HEADERS, addressRows) : 'No addresses defined for any of your jobs',
  };

  const htmlValues = {
    first_name: escapeHtml(values.first_name),
    full_name: escapeHtml(values.full_name),
    start_date: escapeHtml(values.start_date),
    end_date: escapeHtml(values.end_date),
    job_bookings: renderDayTableHtml(BOOKING_HEADERS, bookingRows),
    job_addresses: addressRows.length ? renderDayTableHtml(JOB_ADDRESS_HEADERS, addressRows) : 'No addresses defined for any of your jobs',
  };

  const htmlBody = wrapEmailHtmlBody(interpolate(escapeHtml(template.body), htmlValues));

  return {
    subject: interpolate(template.subject, values),
    text: interpolate(template.body, values),
    html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;">${htmlBody}</div>`,
  };
}
