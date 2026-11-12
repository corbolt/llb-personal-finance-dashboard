/**
 * Dates are handled as plain ISO strings (`YYYY-MM-DD`) and months as
 * `YYYY-MM`. Bank bookings are calendar dates without a time zone, so nothing
 * here ever converts through local time.
 *
 * This file is calendar arithmetic only. Turning a date into text depends on
 * the interface language and lives in `src/i18n/format.ts`.
 */

export type IsoDate = string; // YYYY-MM-DD
export type IsoMonth = string; // YYYY-MM

const DAY_MS = 86_400_000;

function utc(date: IsoDate): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtc(ms: number): IsoDate {
  return new Date(ms).toISOString().slice(0, 10);
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return fromUtc(utc(value)) === value;
}

export function isIsoMonth(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function monthOf(date: IsoDate): IsoMonth {
  return date.slice(0, 7);
}

export function dayOfMonth(date: IsoDate): number {
  return Number(date.slice(8, 10));
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return fromUtc(utc(date) + days * DAY_MS);
}

/** Whole days from `a` to `b` (positive when `b` is later). */
export function diffDays(a: IsoDate, b: IsoDate): number {
  return Math.round((utc(b) - utc(a)) / DAY_MS);
}

export function addMonths(month: IsoMonth, delta: number): IsoMonth {
  const [y, m] = month.split("-").map(Number);
  const index = y * 12 + (m - 1) + delta;
  const year = Math.floor(index / 12);
  const mon = index - year * 12 + 1;
  return `${String(year).padStart(4, "0")}-${String(mon).padStart(2, "0")}`;
}

export function daysInMonth(month: IsoMonth): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function monthStart(month: IsoMonth): IsoDate {
  return `${month}-01`;
}

export function monthEnd(month: IsoMonth): IsoDate {
  return `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
}

/** Same day next month(s), clamped to the month's length (31 Jan → 28 Feb). */
export function addMonthsToDate(date: IsoDate, delta: number): IsoDate {
  const month = addMonths(monthOf(date), delta);
  const day = Math.min(dayOfMonth(date), daysInMonth(month));
  return `${month}-${String(day).padStart(2, "0")}`;
}

/** Every month from `from` to `to`, inclusive. */
export function monthRange(from: IsoMonth, to: IsoMonth): IsoMonth[] {
  const months: IsoMonth[] = [];
  for (let m = from; m <= to; m = addMonths(m, 1)) months.push(m);
  return months;
}

/** Today's date in the server's local time zone. */
export function todayIso(now: Date = new Date()): IsoDate {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Day of the week, `0` for Sunday through `6` for Saturday. */
export function weekdayOf(date: IsoDate): number {
  return new Date(utc(date)).getUTCDay();
}
