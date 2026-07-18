import { addDays } from './dates';

// Matariki's date is gazetted by the NZ government year-by-year, not
// computable by formula. Confirmed officially for 2024/2025; 2026/2027
// are best-available and worth double-checking against the official
// gazette (https://www.employment.govt.nz/leave-and-holidays/public-holidays/matariki)
// closer to the date.
const MATARIKI_DATES: Record<number, Date> = {
  2024: new Date(2024, 5, 28),
  2025: new Date(2025, 5, 20),
  2026: new Date(2026, 6, 10),
  2027: new Date(2027, 5, 25),
};

function nthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): Date {
  const d = new Date(year, month, 1);
  let count = 0;
  while (true) {
    if (d.getDay() === weekday) {
      count++;
      if (count === n) return new Date(d);
    }
    d.setDate(d.getDate() + 1);
  }
}

// Anonymous Gregorian algorithm (Meeus/Jones/Butcher).
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

// A holiday that falls on a weekend is observed the following Monday.
function mondayise(date: Date): Date {
  const day = date.getDay();
  if (day === 6) return addDays(date, 2);
  if (day === 0) return addDays(date, 1);
  return date;
}

// Christmas Day/Boxing Day and New Year's Day/Day-after-New-Year's are
// adjacent-day holiday pairs — the Holidays Act shifts them together so
// the two observed dates never collide (e.g. Christmas on a Saturday
// moves to Monday, and Boxing Day on the Sunday moves to the Tuesday,
// rather than both landing on the same Monday).
function mondayisePair(first: Date, second: Date): [Date, Date] {
  const firstDay = first.getDay();
  const secondDay = second.getDay();
  if (firstDay === 6 && secondDay === 0) {
    return [addDays(first, 2), addDays(second, 2)];
  }
  if (firstDay === 0 && secondDay === 1) {
    return [addDays(first, 2), second];
  }
  let newSecond = second;
  if (firstDay >= 1 && firstDay <= 5 && secondDay === 6) {
    newSecond = addDays(second, 2);
  } else if (firstDay >= 1 && firstDay <= 5 && secondDay === 0) {
    newSecond = addDays(second, 1);
  }
  return [first, newSecond];
}

// Observed the Friday following Canterbury Show Day (the second Tuesday
// of November).
function canterburyAnniversaryDay(year: number): Date {
  return addDays(nthWeekdayOfMonth(year, 10, 2, 2), 3);
}

export interface Holiday {
  date: Date;
  name: string;
}

export function nzHolidaysForYear(year: number): Holiday[] {
  const [newYearsDay, dayAfterNewYear] = mondayisePair(new Date(year, 0, 1), new Date(year, 0, 2));
  const [christmasDay, boxingDay] = mondayisePair(new Date(year, 11, 25), new Date(year, 11, 26));
  const easter = easterSunday(year);

  const holidays: Holiday[] = [
    { date: newYearsDay, name: "New Year's Day" },
    { date: dayAfterNewYear, name: 'Day after New Year' },
    { date: mondayise(new Date(year, 1, 6)), name: 'Waitangi Day' },
    { date: addDays(easter, -2), name: 'Good Friday' },
    { date: addDays(easter, 1), name: 'Easter Monday' },
    { date: mondayise(new Date(year, 3, 25)), name: 'ANZAC Day' },
    { date: nthWeekdayOfMonth(year, 5, 1, 1), name: "King's Birthday" },
    { date: canterburyAnniversaryDay(year), name: 'Canterbury Anniversary Day' },
    { date: nthWeekdayOfMonth(year, 9, 1, 4), name: 'Labour Day' },
    { date: christmasDay, name: 'Christmas Day' },
    { date: boxingDay, name: 'Boxing Day' },
  ];

  const matariki = MATARIKI_DATES[year];
  if (matariki) holidays.push({ date: matariki, name: 'Matariki' });

  return holidays;
}

export function nzHolidaysInRange(start: Date, end: Date): Holiday[] {
  const holidays: Holiday[] = [];
  for (let year = start.getFullYear(); year <= end.getFullYear(); year++) {
    for (const h of nzHolidaysForYear(year)) {
      if (h.date >= start && h.date <= end) holidays.push(h);
    }
  }
  return holidays;
}
