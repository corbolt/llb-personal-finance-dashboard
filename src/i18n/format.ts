import { diffDays, weekdayOf, type IsoDate, type IsoMonth } from "../lib/dates";
import { formatAxisValue } from "../lib/money";
import type { Translator } from "./translate";

/**
 * Dates and compact numbers in the interface language.
 *
 * The names and patterns come from the catalog (`date.*`, `number.*`), not
 * from `Intl.DateTimeFormat`: its output depends on the ICU version ("Sep" in
 * one runtime, "Sept" in another), and text rendered on the server must match
 * what the browser renders when it hydrates the page.
 *
 * Money is not here: amounts follow the Swiss convention in every language
 * (`CHF 1’234.50`, see `lib/money.ts`).
 */
export interface Formatters {
  /** `11 Nov 2026` */
  date(date: IsoDate): string;
  /** `11 Nov` */
  dayMonth(date: IsoDate): string;
  /** `Wed 11 Nov` — adds the year when it differs from `referenceYear`. */
  dayHeading(date: IsoDate, referenceYear?: string): string;
  /** `November 2026` */
  month(month: IsoMonth): string;
  /** `November` */
  monthName(month: IsoMonth): string;
  /** `Nov` — or `Nov 26` when `withYear` is set. */
  monthShort(month: IsoMonth, withYear?: boolean): string;
  /** `3 days ago`, `in 5 days`, `today` — relative to `today`. */
  relativeDay(date: IsoDate, today: IsoDate): string;
  /** Axis tick label: `2’500` on a small axis, `7.5K` on a large one. */
  axisValue(units: number, axisMax: number): string;
}

export function createFormatters(t: Translator): Formatters {
  const months = t.list("date.months");
  const monthsShort = t.list("date.monthsShort");
  const weekdays = t.list("date.weekdaysShort");

  const parts = (date: IsoDate) => {
    const [year, month, day] = date.split("-").map(Number);
    return { year, day, month: monthsShort[month - 1] ?? "" };
  };
  const monthName = (month: IsoMonth) => months[Number(month.slice(5, 7)) - 1] ?? "";

  return {
    date: (date) => t("date.full", parts(date)),
    dayMonth: (date) => t("date.dayMonth", parts(date)),
    dayHeading(date, referenceYear) {
      const { year, ...dayAndMonth } = parts(date);
      const weekday = weekdays[weekdayOf(date)];
      return referenceYear && referenceYear !== date.slice(0, 4)
        ? t("date.dayHeadingYear", { weekday, ...dayAndMonth, year })
        : t("date.dayHeading", { weekday, ...dayAndMonth });
    },
    month: (month) => t("date.monthYear", { month: monthName(month), year: month.slice(0, 4) }),
    monthName,
    monthShort(month, withYear = false) {
      const name = monthsShort[Number(month.slice(5, 7)) - 1] ?? "";
      return withYear ? t("date.monthShortYear", { month: name, year: month.slice(2, 4) }) : name;
    },
    relativeDay(date, today) {
      const delta = diffDays(today, date);
      if (delta === 0) return t("date.today");
      if (delta === 1) return t("date.tomorrow");
      if (delta === -1) return t("date.yesterday");
      return delta > 0 ? t("date.inDays", { count: delta }) : t("date.daysAgo", { count: -delta });
    },
    axisValue: (units, axisMax) =>
      formatAxisValue(units, axisMax, {
        thousands: (value) => t("number.thousands", { value }),
        millions: (value) => t("number.millions", { value }),
      }),
  };
}
