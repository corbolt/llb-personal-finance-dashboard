import type { IsoDate } from "../../lib/dates";
import type { Db } from "../db/database";
import type { Cadence } from "../import/merchants";
import { getDataRange } from "./accounts";
import {
  detectRecurring,
  nextOccurrence,
  type Direction,
  type RecurringInput,
  type RecurringOverride,
  type RecurringSeries,
} from "../recurring/detect";

export interface RecurringOverview {
  /** Every detected series, active and inactive. */
  series: RecurringSeries[];
  /** The day up to which bookings are known. */
  dataThrough: IsoDate | null;
}

export function loadOverrides(db: Db): RecurringOverride[] {
  return db.all<RecurringOverride>(
    "SELECT merchant_key AS merchantKey, direction, decision, cadence FROM recurring_overrides",
  );
}

/** Runs recurring-payment detection over everything stored. */
export function getRecurring(db: Db): RecurringOverview {
  const transactions = db.all<RecurringInput>(
    `SELECT id, date, amount, merchant, merchant_key AS merchantKey, kind,
            raw_text AS rawText, category_id AS categoryId,
            category_name AS categoryName, category_icon AS categoryIcon
     FROM transactions_view
     WHERE excluded = 0 AND flow != 'transfer'
     ORDER BY date, seq`,
  );
  const dataThrough = getDataRange(db).coveredThrough;
  if (!dataThrough) return { series: [], dataThrough: null };
  return { series: detectRecurring(transactions, loadOverrides(db), dataThrough), dataThrough };
}

export interface UpcomingCharge {
  series: RecurringSeries;
  date: IsoDate;
}

/** Expected charges of active series from `from` through `to`, soonest first. */
export function upcomingCharges(
  series: readonly RecurringSeries[],
  from: IsoDate,
  to: IsoDate,
): UpcomingCharge[] {
  return series
    .filter((item) => item.active)
    .map((item) => ({ series: item, date: nextOccurrence(item, from) }))
    .filter((charge) => charge.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date) || b.series.amount - a.series.amount);
}

export interface IgnoredMerchant {
  merchantKey: string;
  merchant: string;
  direction: Direction;
}

/** Merchants the user marked as "not recurring". */
export function listIgnoredRecurring(db: Db): IgnoredMerchant[] {
  return db.all<IgnoredMerchant>(
    `SELECT
       o.merchant_key AS merchantKey,
       COALESCE(
         (SELECT MAX(t.merchant) FROM transactions t WHERE t.merchant_key = o.merchant_key),
         o.merchant_key
       ) AS merchant,
       o.direction
     FROM recurring_overrides o
     WHERE o.decision = 'ignore'
     ORDER BY merchant COLLATE NOCASE`,
  );
}

export interface MerchantRecurringState {
  decision: "ignore" | "force" | null;
  cadence: Cadence | null;
}

export function getRecurringState(
  db: Db,
  merchantKey: string,
  direction: Direction,
): MerchantRecurringState {
  const row = db.get<{ decision: "ignore" | "force"; cadence: Cadence | null }>(
    "SELECT decision, cadence FROM recurring_overrides WHERE merchant_key = ? AND direction = ?",
    [merchantKey, direction],
  );
  return { decision: row?.decision ?? null, cadence: row?.cadence ?? null };
}
