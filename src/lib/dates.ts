/**
 * Dates are handled as plain ISO strings (`YYYY-MM-DD`) and months as
 * `YYYY-MM`. Bank bookings are calendar dates without a time zone, so nothing
 * here ever converts through local time.
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

/*
 * Formatting uses fixed English names instead of `Intl.DateTimeFormat`: its
 * output depends on the ICU version ("Sep" in one runtime, "Sept" in another),
 * and text rendered on the server must match what the browser renders when it
 * hydrates the page.
 */
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const monthName = (month: number) => MONTHS[month - 1] ?? "";
const monthAbbreviation = (month: number) => monthName(month).slice(0, 3);

function parts(date: IsoDate): { year: number; month: number; day: number } {
  const [year, month, day] = date.split("-").map(Number);
  return { year, month, day };
}

/** `11 Nov 2026` */
export function formatDate(date: IsoDate): string {
  const { year, month, day } = parts(date);
  return `${day} ${monthAbbreviation(month)} ${year}`;
}

/** `11 Nov` */
export function formatDayMonth(date: IsoDate): string {
  const { month, day } = parts(date);
  return `${day} ${monthAbbreviation(month)}`;
}

/** `Wed 11 Nov` — adds the year when it differs from `referenceYear`. */
export function formatDayHeading(date: IsoDate, referenceYear?: string): string {
  const weekday = WEEKDAYS[new Date(utc(date)).getUTCDay()];
  const base = `${weekday} ${formatDayMonth(date)}`;
  const year = date.slice(0, 4);
  return referenceYear && referenceYear !== year ? `${base} ${year}` : base;
}

/** `November 2026` */
export function formatMonth(month: IsoMonth): string {
  return `${formatMonthName(month)} ${month.slice(0, 4)}`;
}

/** `November` */
export function formatMonthName(month: IsoMonth): string {
  return monthName(Number(month.slice(5, 7)));
}

/** `Nov` — or `Nov 26` when `withYear` is set. */
export function formatMonthShort(month: IsoMonth, withYear = false): string {
  const name = monthAbbreviation(Number(month.slice(5, 7)));
  return withYear ? `${name} ${month.slice(2, 4)}` : name;
}

/** `3 days ago`, `in 5 days`, `today` — relative to `today`. */
export function formatRelativeDay(date: IsoDate, today: IsoDate): string {
  const delta = diffDays(today, date);
  if (delta === 0) return "today";
  if (delta === 1) return "tomorrow";
  if (delta === -1) return "yesterday";
  if (delta > 0) return `in ${delta} days`;
  return `${-delta} days ago`;
}
