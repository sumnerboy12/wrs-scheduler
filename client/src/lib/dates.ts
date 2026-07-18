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

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "2026-07-19" -> "19 Jul"
export function formatShortDate(isoDate: string): string {
  const d = parseISODateLocal(isoDate);
  return `${d.getDate()} ${MONTH_ABBR[d.getMonth()]}`;
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
