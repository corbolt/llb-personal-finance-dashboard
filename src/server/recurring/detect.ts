import { addDays, addMonthsToDate, diffDays, monthOf, type IsoDate } from "../../lib/dates";
import { brandForKey, type Cadence } from "../import/merchants";
import { fold } from "../import/text";

/**
 * Finds subscriptions, bills and regular income in the booking history.
 *
 * A merchant's bookings become a recurring series when one of these holds,
 * strongest evidence first:
 *
 *   pattern  – the same amount arrives at a steady rhythm
 *   period   – the booking text states a billing period ("Periode 01.07.–30.09.")
 *   known    – the merchant is a known subscription or utility
 *   keyword  – the text says so ("Miete", "Salär", "Abo") or it is a standing order
 *
 * The user's own decisions (always / never recurring) override all of it.
 */

export interface RecurringInput {
  id: number;
  date: IsoDate;
  /** Signed, minor units. */
  amount: number;
  merchant: string;
  merchantKey: string;
  kind: string;
  rawText: string;
  categoryId: number | null;
  categoryName: string | null;
  categoryIcon: string | null;
}

export type Direction = "out" | "in";

export interface RecurringOverride {
  merchantKey: string;
  direction: Direction;
  decision: "ignore" | "force";
  cadence: Cadence | null;
}

export type Evidence = "confirmed" | "pattern" | "period" | "known" | "keyword";

export interface Occurrence {
  id: number;
  date: IsoDate;
  /** Absolute amount. */
  amount: number;
}

export interface RecurringSeries {
  key: string;
  merchantKey: string;
  merchant: string;
  direction: Direction;
  cadence: Cadence;
  /** Typical amount of one charge. */
  amount: number;
  /** Whether the amount changes from charge to charge. */
  variable: boolean;
  /** What the series costs (or brings in) per month on average. */
  monthlyAmount: number;
  /** Oldest first. */
  occurrences: Occurrence[];
  lastDate: IsoDate;
  /** When the next charge is expected. */
  nextDate: IsoDate;
  /** `false` once an expected charge is clearly overdue — probably cancelled. */
  active: boolean;
  evidence: Evidence;
  categoryId: number | null;
  categoryName: string | null;
  categoryIcon: string | null;
}

export const CADENCES: Cadence[] = [
  "weekly",
  "biweekly",
  "monthly",
  "quarterly",
  "semiannual",
  "yearly",
];

const PER_MONTH: Record<Cadence, number> = {
  weekly: 52 / 12,
  biweekly: 26 / 12,
  monthly: 1,
  quarterly: 1 / 3,
  semiannual: 1 / 6,
  yearly: 1 / 12,
};

/** Days between two charges that still count as the cadence. */
const INTERVAL: Record<Cadence, [min: number, max: number]> = {
  weekly: [5, 9],
  biweekly: [12, 16],
  monthly: [23, 37],
  quarterly: [80, 100],
  semiannual: [170, 195],
  yearly: [350, 380],
};

/** How long after the expected date a missing charge is tolerated. */
const GRACE_DAYS: Record<Cadence, number> = {
  weekly: 4,
  biweekly: 6,
  monthly: 12,
  quarterly: 25,
  semiannual: 40,
  yearly: 60,
};

export function advance(date: IsoDate, cadence: Cadence, steps = 1): IsoDate {
  switch (cadence) {
    case "weekly":
      return addDays(date, 7 * steps);
    case "biweekly":
      return addDays(date, 14 * steps);
    case "monthly":
      return addMonthsToDate(date, steps);
    case "quarterly":
      return addMonthsToDate(date, 3 * steps);
    case "semiannual":
      return addMonthsToDate(date, 6 * steps);
    case "yearly":
      return addMonthsToDate(date, 12 * steps);
  }
}

/** The first expected charge on or after `from`. */
export function nextOccurrence(series: RecurringSeries, from: IsoDate): IsoDate {
  let date = series.nextDate;
  // bounded: a weekly series that ended decades ago must not spin forever
  for (let i = 0; i < 2000 && date < from; i++) date = advance(date, series.cadence);
  return date;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function cadenceForInterval(days: number): Cadence | null {
  for (const cadence of CADENCES) {
    const [min, max] = INTERVAL[cadence];
    if (days >= min && days <= max) return cadence;
  }
  return null;
}

/** The cadence at which the dates repeat, if they do so reliably. */
function rhythm(dates: IsoDate[]): Cadence | null {
  if (dates.length < 2) return null;
  const intervals: number[] = [];
  for (let i = 1; i < dates.length; i++) intervals.push(diffDays(dates[i - 1], dates[i]));
  const cadence = cadenceForInterval(median(intervals));
  if (!cadence) return null;

  const [min, max] = INTERVAL[cadence];
  let skipped = 0;
  for (const interval of intervals) {
    if (interval >= min && interval <= max) continue;
    // one charge missing in between (card expired, paid late together …)
    if (interval >= 2 * min && interval <= 2 * max) skipped += 1;
    else return null;
  }
  return skipped <= Math.floor(intervals.length / 4) ? cadence : null;
}

/** Groups bookings whose amounts are equal give or take 3 % (at least 1.00). */
function clusterByAmount(rows: RecurringInput[]): RecurringInput[][] {
  const sorted = [...rows].sort((a, b) => Math.abs(a.amount) - Math.abs(b.amount));
  const clusters: RecurringInput[][] = [];
  let previous = Number.NEGATIVE_INFINITY;
  for (const row of sorted) {
    const amount = Math.abs(row.amount);
    if (amount - previous <= Math.max(100, previous * 0.03)) clusters[clusters.length - 1].push(row);
    else clusters.push([row]);
    previous = amount;
  }
  return clusters.map((cluster) => cluster.sort((a, b) => a.date.localeCompare(b.date)));
}

const PERIOD = /(\d{2})\.(\d{2})\.(\d{4})\s*[-–]\s*(\d{2})\.(\d{2})\.(\d{4})/;

/** Cadence implied by a billing period printed in the booking text. */
export function periodCadence(rawText: string): Cadence | null {
  const match = PERIOD.exec(rawText);
  if (!match) return null;
  const from = `${match[3]}-${match[2]}-${match[1]}`;
  const to = `${match[6]}-${match[5]}-${match[4]}`;
  const days = diffDays(from, to) + 1;
  if (days >= 6 && days <= 8) return "weekly";
  if (days >= 13 && days <= 15) return "biweekly";
  if (days >= 27 && days <= 32) return "monthly";
  if (days >= 88 && days <= 93) return "quarterly";
  if (days >= 180 && days <= 185) return "semiannual";
  if (days >= 364 && days <= 367) return "yearly";
  return null;
}

const KEYWORD_CADENCE: Array<[RegExp, Cadence]> = [
  [/\bjahres(beitrag|abo|gebuhr|pramie|rechnung)|\bjahrlich|\bannual\b|\byearly\b/, "yearly"],
  [/\bquartal/, "quarterly"],
  [
    /\bmiete\b|\bmietzins|\bsalar|\blohn(zahlung)?\b|\bgehalt\b|\bmonats(beitrag|abo|rate|pramie|miete)|\bmonatlich|\bleasingrate|\babo(nnement)?\b|\bmitgliedschaft|\bmembership\b|\bsubscription\b/,
    "monthly",
  ],
];

function keywordCadence(rows: RecurringInput[]): Cadence | null {
  for (const row of rows) {
    const text = fold(row.rawText);
    for (const [pattern, cadence] of KEYWORD_CADENCE) {
      if (pattern.test(text)) return cadence;
    }
  }
  return null;
}

function distinctMonths(rows: RecurringInput[]): string[] {
  return [...new Set(rows.map((row) => monthOf(row.date)))].sort();
}

/** Calendar months from the first to the last booking, inclusive. */
function monthsSpanned(rows: Array<{ date: IsoDate }>): number {
  const first = rows[0].date;
  const last = rows[rows.length - 1].date;
  const months =
    (Number(last.slice(0, 4)) - Number(first.slice(0, 4))) * 12 +
    (Number(last.slice(5, 7)) - Number(first.slice(5, 7)));
  return months + 1;
}

/** Paid in each of the last three or more months, at most about twice a month. */
function paidEveryMonth(rows: RecurringInput[]): boolean {
  const months = distinctMonths(rows);
  if (months.length < 3 || rows.length > months.length * 2) return false;
  return monthsSpanned(rows) === months.length;
}

interface Draft {
  rows: RecurringInput[];
  cadence: Cadence;
  evidence: Evidence;
  /** One series for the whole merchant rather than for one amount. */
  merchantLevel: boolean;
}

function detectGroup(rows: RecurringInput[], direction: Direction): Draft[] {
  const brand = brandForKey(rows[0].merchantKey);
  const knownCadence = direction === "out" ? (brand?.cadence ?? null) : null;
  const mostlyCard = rows.filter((row) => row.kind === "card").length > rows.length / 2;
  const months = distinctMonths(rows).length;

  // Somewhere the card is used all the time (bakery, supermarket) produces
  // equal amounts at regular gaps by pure chance — never a subscription.
  const habitual = mostlyCard && !knownCadence && rows.length > months * 2 + 1;
  if (habitual) return [];

  const drafts: Draft[] = [];
  const used = new Set<number>();
  const take = (cluster: RecurringInput[]) => cluster.forEach((row) => used.add(row.id));

  // 1. the same amount at a steady rhythm
  const needed = mostlyCard && !knownCadence ? 3 : 2;
  for (const cluster of clusterByAmount(rows)) {
    if (cluster.length < needed) continue;
    const cadence = rhythm(cluster.map((row) => row.date));
    if (!cadence) continue;
    drafts.push({ rows: cluster, cadence, evidence: "pattern", merchantLevel: false });
    take(cluster);
  }

  // A price change must not end a series: keep following it while the next
  // charge arrives on schedule at a broadly similar amount.
  for (const draft of drafts) {
    const [min, max] = INTERVAL[draft.cadence];
    for (;;) {
      const latest = draft.rows[draft.rows.length - 1];
      const successor = rows.find((row) => {
        if (used.has(row.id)) return false;
        const gap = diffDays(latest.date, row.date);
        const ratio = Math.abs(row.amount) / Math.abs(latest.amount);
        return gap >= min && gap <= max && ratio >= 0.7 && ratio <= 1.3;
      });
      if (!successor) break;
      draft.rows.push(successor);
      used.add(successor.id);
    }
  }

  // 2. bookings that name their billing period
  const withPeriod = rows.filter((row) => !used.has(row.id) && periodCadence(row.rawText));
  for (const cluster of clusterByAmount(withPeriod)) {
    const cadence = periodCadence(cluster[cluster.length - 1].rawText)!;
    drafts.push({ rows: cluster, cadence, evidence: "period", merchantLevel: false });
    take(cluster);
  }
  if (drafts.length > 0) return drafts;

  // 3. nothing specific found: fall back to what is known about the merchant
  if (knownCadence) {
    return [{ rows, cadence: knownCadence, evidence: "known", merchantLevel: true }];
  }
  const fromKeyword = keywordCadence(rows);
  if (fromKeyword) {
    return [{ rows, cadence: fromKeyword, evidence: "keyword", merchantLevel: true }];
  }
  if (rows.some((row) => row.kind === "standing_order" || row.kind === "direct_debit")) {
    return [{ rows, cadence: "monthly", evidence: "keyword", merchantLevel: true }];
  }
  if (!mostlyCard && paidEveryMonth(rows)) {
    return [{ rows, cadence: "monthly", evidence: "pattern", merchantLevel: true }];
  }
  return [];
}

function toSeries(draft: Draft, direction: Direction, dataThrough: IsoDate): RecurringSeries {
  const rows = [...draft.rows].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
  const occurrences: Occurrence[] = rows.map((row) => ({
    id: row.id,
    date: row.date,
    amount: Math.abs(row.amount),
  }));
  const amounts = occurrences.map((occurrence) => occurrence.amount);
  const spread = Math.max(...amounts) - Math.min(...amounts);
  // A series found by its amount has a price (the latest one, should it have
  // changed); a merchant-wide series may vary from bill to bill.
  const variable = draft.merchantLevel && spread > Math.max(100, median(amounts) * 0.05);
  const amount = variable ? median(amounts.slice(-6)) : amounts[amounts.length - 1];

  const averaged = draft.merchantLevel && draft.cadence === "monthly" && occurrences.length > 1;
  const monthlyAmount = averaged
    ? Math.round(amounts.reduce((sum, value) => sum + value, 0) / monthsSpanned(occurrences))
    : Math.round(amount * PER_MONTH[draft.cadence]);

  const latest = rows[rows.length - 1];
  const nextDate = advance(latest.date, draft.cadence);

  return {
    key: draft.merchantLevel
      ? `${direction}:${latest.merchantKey}`
      : `${direction}:${latest.merchantKey}:${amount}`,
    merchantKey: latest.merchantKey,
    merchant: latest.merchant,
    direction,
    cadence: draft.cadence,
    amount,
    variable,
    monthlyAmount,
    occurrences,
    lastDate: latest.date,
    nextDate,
    active: diffDays(nextDate, dataThrough) <= GRACE_DAYS[draft.cadence],
    evidence: draft.evidence,
    categoryId: latest.categoryId,
    categoryName: latest.categoryName,
    categoryIcon: latest.categoryIcon,
  };
}

/**
 * @param transactions bookings to analyse (transfers and excluded ones left out)
 * @param dataThrough  the day up to which bookings are known; a series whose
 *                     next charge is long overdue by then is marked inactive
 */
export function detectRecurring(
  transactions: readonly RecurringInput[],
  overrides: readonly RecurringOverride[],
  dataThrough: IsoDate,
): RecurringSeries[] {
  const groups = new Map<string, RecurringInput[]>();
  for (const tx of transactions) {
    if (tx.amount === 0) continue;
    const direction: Direction = tx.amount < 0 ? "out" : "in";
    const key = `${direction}:${tx.merchantKey}`;
    const group = groups.get(key);
    if (group) group.push(tx);
    else groups.set(key, [tx]);
  }

  const overrideByKey = new Map(
    overrides.map((override) => [`${override.direction}:${override.merchantKey}`, override]),
  );

  const series: RecurringSeries[] = [];
  for (const [key, rows] of groups) {
    const direction = key.startsWith("out:") ? "out" : "in";
    const override = overrideByKey.get(key);
    if (override?.decision === "ignore") continue;

    const drafts: Draft[] =
      override?.decision === "force"
        ? [{ rows, cadence: override.cadence ?? "monthly", evidence: "confirmed", merchantLevel: true }]
        : detectGroup(rows, direction);
    for (const draft of drafts) series.push(toSeries(draft, direction, dataThrough));
  }

  return series.sort(
    (a, b) => a.merchant.localeCompare(b.merchant) || b.amount - a.amount || a.key.localeCompare(b.key),
  );
}
