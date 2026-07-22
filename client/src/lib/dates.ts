// Uses local date components, not UTC — vis-timeline hands us Dates
// representing the wall-clock day the user saw/dragged in their own
// timezone, and toISOString() would read that back as a UTC date, which
// silently rolls back a day in positive-UTC-offset zones (e.g. NZ).
export function toISODate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

export function addMonths(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setMonth(copy.getMonth() + n);
  return copy;
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function startOfQuarter(d: Date): Date {
  const qMonth = Math.floor(d.getMonth() / 3) * 3;
  return new Date(d.getFullYear(), qMonth, 1);
}

export function startOfWeek(d: Date): Date {
  const copy = new Date(d);
  const day = copy.getDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day; // treat Monday as start of week
  copy.setDate(copy.getDate() + diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

// Assignment end_date is inclusive (last worked day); vis-timeline expects
// an exclusive end, so bars for the last day render at full width.
export function isoDatePlusOne(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00');
  return toISODate(addDays(d, 1));
}

// Parses a "YYYY-MM-DD" string as local midnight. Never hand vis-timeline
// a bare date string directly — per the ECMAScript spec, date-only ISO
// strings parse as UTC, which anchors every item several hours off local
// midnight (a whole half-day in NZ). That mis-anchoring is invisible at
// a glance but corrupts every drag/resize, since vis-timeline computes
// the new start/end from that wrong anchor plus a pixel-derived offset.
export function parseISODateLocal(isoDate: string): Date {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, month - 1, day);
}

const WEEKDAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// "2026-07-20" -> "Mon 20/07"
export function formatShortDate(isoDate: string): string {
  const d = parseISODateLocal(isoDate);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${WEEKDAY_ABBR[d.getDay()]} ${day}/${month}`;
}

// Parses a date typed/pasted into an imported spreadsheet cell. Tries ISO
// (YYYY-MM-DD) first, then day/month/year with '/' or '-' separators (NZ's
// usual written convention), then falls back to whatever the JS Date
// constructor can make of it (e.g. "22 May 2026"). Returns null rather than
// throwing so a bad cell just surfaces as an ordinary per-row import
// failure instead of crashing the whole import.
export function parseFlexibleDate(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  const dmyMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (dmyMatch) {
    const [, d, m, yRaw] = dmyMatch;
    const y = yRaw.length === 2 ? 2000 + Number(yRaw) : Number(yRaw);
    const date = new Date(y, Number(m) - 1, Number(d));
    // Date rolls over invalid day/month combos (e.g. 31/02) rather than
    // erroring — catch that here instead of silently importing March 2nd.
    if (date.getMonth() !== Number(m) - 1) return null;
    return toISODate(date);
  }

  const fallback = new Date(trimmed);
  return isNaN(fallback.getTime()) ? null : toISODate(fallback);
}

export type ZoomPreset = 'day' | 'week' | 'month' | 'quarter';

export function presetWindow(preset: ZoomPreset, center: Date): { start: Date; end: Date } {
  switch (preset) {
    case 'day':
      return { start: addDays(center, -1), end: addDays(center, 2) };
    case 'week':
      return { start: startOfWeek(center), end: addDays(startOfWeek(center), 14) };
    case 'month':
      return { start: startOfMonth(center), end: addMonths(startOfMonth(center), 1) };
    case 'quarter':
      return { start: startOfQuarter(center), end: addMonths(startOfQuarter(center), 3) };
  }
}
