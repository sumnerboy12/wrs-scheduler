// Shared by weeklySummary.js (employee summaries) and jobSummary.js (job
// crew summaries) — date/formatting plumbing that's identical for both,
// only the row shape and template placeholders differ per flavor.

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Parsed as local calendar values (not through Date-with-timezone parsing)
// so a stored '2026-07-20' always reads as the 20th regardless of the
// server's own timezone offset.
export function parseISODate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatDate(iso) {
  const date = parseISODate(iso);
  const d = date.getDate();
  const m = date.getMonth();
  return `${WEEKDAY[date.getDay()]} ${d} ${MONTH[m]}`;
}

// Monday of the calendar week containing `date`.
export function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sunday
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  d.setHours(0, 0, 0, 0);
  return d;
}

// Monday–Sunday of next calendar week — the range both auto-send jobs email
// out, mirroring the client's own "Next week" shortcut.
export function nextWeekRange() {
  const nextMonday = startOfWeek(new Date());
  nextMonday.setDate(nextMonday.getDate() + 7);
  const sunday = new Date(nextMonday);
  sunday.setDate(sunday.getDate() + 6);
  return { start: toISODate(nextMonday), end: toISODate(sunday) };
}

// Identifies "this calendar week" (as the ISO date of its Monday) so a
// scheduler can tell whether it's already sent this week's batch, even if
// it gets checked many times on send day before the next week rolls over.
export function currentWeekKey(date = new Date()) {
  return toISODate(startOfWeek(date));
}

// The last weekday (Mon–Fri) on or before `iso` — used to compute the
// {{end_date}} shown in a summary email when weekends are excluded from
// the table, so the greeting doesn't claim a range running through a
// Saturday/Sunday the table itself never shows a row for.
export function lastWeekdayOnOrBefore(iso) {
  const date = parseISODate(iso);
  while (date.getDay() === 0 || date.getDay() === 6) {
    date.setDate(date.getDate() - 1);
  }
  return toISODate(date);
}

// Sentinel pushed into a day-table's rows list at each calendar-week
// boundary so the renderers below can draw a full-width divider there
// instead of a data row.
export const WEEK_SEPARATOR = Symbol('week-separator');

// Walks each calendar day in [startDate, endDate], skipping Saturday/Sunday
// unless includeWeekends is on, calling `onDay(dayLabel, iso, rows)` for
// each one kept — the caller pushes whatever row(s) that day needs onto
// `rows` itself (a plain assignment day might need one row per booking, a
// job's crew day one row per phase, etc.). A WEEK_SEPARATOR is inserted
// automatically at each Mon–Sun boundary the range actually crosses (a
// single week never gets one).
export function buildDayRows(startDate, endDate, includeWeekends, onDay) {
  const rows = [];
  const end = parseISODate(endDate);
  for (let cursor = parseISODate(startDate); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    const dayOfWeek = cursor.getDay(); // 0 = Sunday, 6 = Saturday
    if (!includeWeekends && (dayOfWeek === 0 || dayOfWeek === 6)) continue;
    if (dayOfWeek === 1 && rows.length > 0) rows.push(WEEK_SEPARATOR);

    const iso = toISODate(cursor);
    onDay(formatDate(iso), iso, rows);
  }
  return rows;
}

// Fixed-width plain-text table — a reasonable fallback only for clients
// that render the plain-text part in a monospace font. Most (e.g. Outlook)
// don't, so it's no longer the primary rendering (see renderDayTableHtml
// below), but it's kept as the multipart/alternative text version for
// clients that can't render HTML at all.
export function renderDayTableText(headers, rows) {
  const dataRows = rows.filter((r) => r !== WEEK_SEPARATOR);
  const widths = headers.map((h, i) => Math.max(h.length, ...dataRows.map((r) => r[i].length)));
  const formatRow = (cells) => cells.map((c, i) => c.padEnd(widths[i])).join('  ').trimEnd();
  const headerSeparator = widths.map((w) => '-'.repeat(w)).join('  ');
  const body = rows.map((row) => (row === WEEK_SEPARATOR ? headerSeparator : formatRow(row)));
  return [formatRow(headers), headerSeparator, ...body].join('\n');
}

// Real HTML <table> — unlike the plain-text version, its column alignment
// doesn't depend on the recipient's client using a monospace font (Outlook
// in particular renders plain text proportionally, which breaks the padded
// column approach entirely).
export function renderDayTableHtml(headers, rows) {
  const cell = (text) => `<td style="padding:4px 12px 4px 0;border-bottom:1px solid #e2e2e2;">${escapeHtml(text)}</td>`;
  const headerCell = (text) => `<th style="padding:4px 12px 4px 0;border-bottom:2px solid #333;text-align:left;">${escapeHtml(text)}</th>`;
  const body = rows
    .map((row) =>
      row === WEEK_SEPARATOR
        ? `<tr><td colspan="${headers.length}" style="padding:6px 0;border-bottom:2px solid #333;"></td></tr>`
        : `<tr>${row.map(cell).join('')}</tr>`
    )
    .join('');
  return (
    `<table style="border-collapse:collapse;font-family:Arial,Helvetica,sans-serif;font-size:14px;">` +
    `<thead><tr>${headers.map(headerCell).join('')}</tr></thead>` +
    `<tbody>${body}</tbody></table>`
  );
}

export function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// {{placeholder}} substitution — deliberately simple (no loops/conditionals
// in the template itself) so the admin-editable part stays a plain string;
// any placeholder can expand to a whole pre-rendered block rather than a
// single value (e.g. {{bookings}}, {{crew}}).
export function interpolate(template, values) {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => (key in values ? values[key] : match));
}
