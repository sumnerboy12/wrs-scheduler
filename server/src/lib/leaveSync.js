import db from '../db/index.js';
import { broadcast } from './events.js';

// Maps the free-text leave type the feed puts after "Name: " in SUMMARY to
// our own leave_periods.type enum. "Public Holiday" is deliberately
// unmapped — see shouldImport below, it's never synced in at all. These
// are the exact strings the payroll/HR system we've integrated with so far
// happens to use — a different provider's feed may need different keys.
const LEAVE_TYPE_MAP = {
  'annual leave': 'annual',
  'sick leave': 'sick',
  'acc leave': 'acc',
  'leave without pay': 'other',
  'parental leave without pay': 'other',
};

export function isLeaveSyncConfigured() {
  return Boolean(process.env.LEAVE_CALENDAR_URL);
}

// Minimal RFC5545 parser — just enough for this feed's shape (flat
// BEGIN:VEVENT/END:VEVENT blocks, no nested components, one property per
// line). Handles the one folding case the spec allows (a continuation line
// starting with a space or tab) even though this feed hasn't been observed
// to use it, since a long employee name could plausibly push a line over
// the 75-octet limit some producer decides to wrap at.
function parseICalEvents(icsText) {
  const rawLines = icsText.split(/\r\n|\n|\r/);
  const lines = [];
  for (const line of rawLines) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line);
    }
  }

  const events = [];
  let current = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      current = {};
      continue;
    }
    if (line === 'END:VEVENT') {
      if (current) events.push(current);
      current = null;
      continue;
    }
    if (!current) continue;

    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;
    const rawKey = line.slice(0, colonIndex);
    const value = line.slice(colonIndex + 1);
    // Property parameters (e.g. "DTSTART;VALUE=DATE") ride before the
    // first ';' — only VALUE=DATE actually matters here, to tell a
    // whole-day date (exclusive DTEND) apart from a same-day timed event.
    const [key, ...params] = rawKey.split(';');
    current[key] = { value, isDateOnly: params.includes('VALUE=DATE') };
  }
  return events;
}

// "20260522" (date-only) or "20260522T073000" (timed) -> "2026-05-22".
function toISODate(icalValue) {
  return `${icalValue.slice(0, 4)}-${icalValue.slice(4, 6)}-${icalValue.slice(6, 8)}`;
}

function addDaysToISO(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d + days);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

// A whole-day DTEND in iCal is exclusive (the day *after* the last day of
// the event) — confirmed against this feed itself: a 4-day "Annual Leave"
// span comes through as DTSTART 05-25/DTEND 05-29, i.e. May 25–28 inclusive.
// A timed DTEND (same-day, just a clock-out time) needs no adjustment —
// it's already the actual last day.
function extractRange(event) {
  const start = event.DTSTART;
  const end = event.DTEND;
  if (!start || !end) return null;
  const startISO = toISODate(start.value);
  const endISO = end.isDateOnly ? addDaysToISO(toISODate(end.value), -1) : toISODate(end.value);
  return { start_date: startISO, end_date: endISO };
}

// "4.00 days - Second Approved" -> "Second Approved". This feed's own
// status text is inconsistent about the space ("Second Approved" vs
// "SecondApproved" elsewhere in the same feed) — comparisons below just
// lowercase and strip spaces rather than trying to enumerate every variant.
function extractStatus(description) {
  const match = description?.match(/-\s*(.+)$/);
  return match ? match[1].trim() : '';
}

function normalizeStatus(status) {
  return status.toLowerCase().replace(/\s+/g, '');
}

// Only leave that's actually been approved (or already processed by
// payroll) is synced in — a Draft or Submitted request might never be
// approved, and showing it as a real booking on the schedule would be
// showing something that isn't a commitment yet.
function isApprovedStatus(status) {
  const normalized = normalizeStatus(status);
  return normalized === 'processed' || normalized.includes('approved');
}

// Parses one VEVENT into { name, type, startDate, endDate, uid } or null if
// it should be skipped (unparseable, a Public Holiday, or not yet approved).
function parseLeaveEvent(event) {
  const summary = event.SUMMARY?.value;
  const uid = event.UID?.value;
  if (!summary || !uid) return null;

  // "ZZZ - " is this payroll system's convention for a departed employee,
  // sorting them to the end of alphabetical staff lists — strip it so the
  // name still matches if they're (unusually) still active in Rostr; if
  // they're not in Rostr at all it simply won't match, harmlessly.
  const cleanedSummary = summary.replace(/^ZZZ\s*-\s*/, '');
  const separatorIndex = cleanedSummary.indexOf(': ');
  if (separatorIndex === -1) return null;
  const name = cleanedSummary.slice(0, separatorIndex).trim();
  const typeText = cleanedSummary.slice(separatorIndex + 2).trim();

  if (typeText.toLowerCase() === 'public holiday') return null; // handled separately, see nzHolidays

  const status = extractStatus(event.DESCRIPTION?.value);
  if (!isApprovedStatus(status)) return null;

  const range = extractRange(event);
  if (!range) return null;

  const type = LEAVE_TYPE_MAP[typeText.toLowerCase()] ?? 'other';
  return { name, type, start_date: range.start_date, end_date: range.end_date, uid };
}

// Fetches the calendar, matches each approved leave request to a Rostr
// employee by exact (case/whitespace-insensitive) name match — the feed
// carries no employee id or email, only a display name — and upserts one
// leave_periods row per event, keyed by the feed's own UID so re-running
// this updates/removes rather than duplicating. Any previously-synced row
// (external_id set) whose UID no longer appears in this pull is removed —
// covers a leave request being cancelled or un-approved after the fact.
// Anything entered directly in Rostr (external_id NULL) is never touched.
export async function syncLeaveCalendar() {
  if (!isLeaveSyncConfigured()) throw new Error('Leave sync is not configured — set LEAVE_CALENDAR_URL');

  const res = await fetch(process.env.LEAVE_CALENDAR_URL);
  if (!res.ok) throw new Error(`Leave calendar fetch failed: ${res.status} ${res.statusText}`);
  const icsText = await res.text();

  const employees = db.prepare('SELECT id, name FROM employees').all();
  const employeeByName = new Map(employees.map((e) => [e.name.trim().toLowerCase(), e.id]));

  const events = parseICalEvents(icsText);
  // The WHERE on the DO UPDATE is the other half of the external_locked
  // design (see schema.sql): if the existing row is locked, this whole
  // upsert becomes a no-op for it — recognised (so it's not re-created or
  // deleted below) but never overwritten.
  const upsert = db.prepare(
    `INSERT INTO leave_periods (employee_id, type, start_date, end_date, external_id)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (external_id) DO UPDATE SET
       employee_id = excluded.employee_id,
       type = excluded.type,
       start_date = excluded.start_date,
       end_date = excluded.end_date,
       updated_at = datetime('now')
     WHERE leave_periods.external_locked = 0`
  );

  const seenUids = [];
  const unmatchedNames = new Set();
  let created = 0;
  let updated = 0;
  let skippedLocked = 0;

  for (const event of events) {
    const parsed = parseLeaveEvent(event);
    if (!parsed) continue;

    const employeeId = employeeByName.get(parsed.name.toLowerCase());
    if (!employeeId) {
      unmatchedNames.add(parsed.name);
      continue;
    }

    seenUids.push(parsed.uid);
    const existing = db.prepare('SELECT id, external_locked FROM leave_periods WHERE external_id = ?').get(parsed.uid);
    upsert.run(employeeId, parsed.type, parsed.start_date, parsed.end_date, parsed.uid);
    if (!existing) created++;
    else if (existing.external_locked) skippedLocked++;
    else updated++;
  }

  let deleted = 0;
  // Locked rows are excluded here too — a manually-corrected row survives
  // even if the underlying request is later cancelled/un-approved upstream,
  // since a person already vouched for it being correct.
  const previouslySynced = db
    .prepare('SELECT external_id FROM leave_periods WHERE external_id IS NOT NULL AND external_locked = 0')
    .all();
  const seenSet = new Set(seenUids);
  const deleteStmt = db.prepare('DELETE FROM leave_periods WHERE external_id = ?');
  for (const { external_id } of previouslySynced) {
    if (!seenSet.has(external_id)) {
      deleteStmt.run(external_id);
      deleted++;
    }
  }

  if (created || updated || deleted) broadcast('leave');

  const result = {
    at: new Date().toISOString(),
    created,
    updated,
    deleted,
    skippedLocked,
    unmatchedNames: Array.from(unmatchedNames).sort(),
  };
  db.prepare(
    `INSERT INTO settings (key, value) VALUES ('leave_sync_last_result', ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value`
  ).run(JSON.stringify(result));

  return result;
}

export function getLastLeaveSyncResult() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'leave_sync_last_result'").get();
  return row ? JSON.parse(row.value) : null;
}

const DEFAULT_SYNC_INTERVAL_MINUTES = 60;

export function startLeaveSyncScheduler() {
  if (!isLeaveSyncConfigured()) return;
  const intervalMinutes = Number(process.env.LEAVE_SYNC_INTERVAL_MINUTES) || DEFAULT_SYNC_INTERVAL_MINUTES;

  const run = () => {
    syncLeaveCalendar()
      .then((result) =>
        console.log(
          `[leave sync] created ${result.created}, updated ${result.updated}, deleted ${result.deleted}, skipped (locked) ${result.skippedLocked}` +
            (result.unmatchedNames.length ? `, unmatched: ${result.unmatchedNames.join(', ')}` : '')
        )
      )
      .catch((e) => console.error('[leave sync] failed:', e.message));
  };

  run(); // once immediately on startup, then on the configured interval
  setInterval(run, intervalMinutes * 60_000);
}
