import {
  addMonths,
  daysInMonth,
  monthEnd,
  monthRange,
  monthStart,
  type IsoDate,
  type IsoMonth,
} from "../../lib/dates";
import type { Db } from "../db/database";

/**
 * Money-flow aggregates.
 *
 * Every booking counts towards exactly one flow (see `transactions_view`):
 *   expense  – spending; refunds booked into an expense category reduce it
 *   income   – money coming in
 *   transfer – moves between own accounts, left out of both totals
 * Bookings the user excluded are ignored everywhere.
 *
 * Each aggregate takes an optional `accountId` to look at one account only;
 * without it, all accounts count together.
 */

/** The SQL condition and parameters that narrow a query to one account, if any. */
function forAccount(accountId: number | undefined): { sql: string; params: number[] } {
  return accountId === undefined ? { sql: "", params: [] } : { sql: " AND account_id = ?", params: [accountId] };
}

export interface PeriodTotals {
  income: number;
  spending: number;
  net: number;
  transactionCount: number;
}

export function getTotals(db: Db, from: IsoDate, to: IsoDate, accountId?: number): PeriodTotals {
  const account = forAccount(accountId);
  const row = db.get<{ income: number | null; spending: number | null; n: number }>(
    `SELECT
       SUM(CASE WHEN flow = 'income' THEN amount END) AS income,
       -SUM(CASE WHEN flow = 'expense' THEN amount END) AS spending,
       COUNT(*) AS n
     FROM transactions_view
     WHERE excluded = 0 AND date BETWEEN ? AND ?${account.sql}`,
    [from, to, ...account.params],
  );
  const income = row?.income ?? 0;
  const spending = row?.spending ?? 0;
  return { income, spending, net: income - spending, transactionCount: row?.n ?? 0 };
}

export interface MonthTotals {
  month: IsoMonth;
  income: number;
  spending: number;
}

/** Income and spending for every month in the range, including empty ones. */
export function getMonthlyTotals(
  db: Db,
  fromMonth: IsoMonth,
  toMonth: IsoMonth,
  accountId?: number,
): MonthTotals[] {
  const account = forAccount(accountId);
  const rows = db.all<{ month: string; income: number | null; spending: number | null }>(
    `SELECT
       substr(date, 1, 7) AS month,
       SUM(CASE WHEN flow = 'income' THEN amount END) AS income,
       -SUM(CASE WHEN flow = 'expense' THEN amount END) AS spending
     FROM transactions_view
     WHERE excluded = 0 AND date BETWEEN ? AND ?${account.sql}
     GROUP BY month`,
    [monthStart(fromMonth), monthEnd(toMonth), ...account.params],
  );
  const byMonth = new Map(rows.map((row) => [row.month, row]));
  return monthRange(fromMonth, toMonth).map((month) => ({
    month,
    income: byMonth.get(month)?.income ?? 0,
    spending: byMonth.get(month)?.spending ?? 0,
  }));
}

/** Net spending per day of the month; index 0 is the 1st. */
export function getDailySpending(db: Db, month: IsoMonth, accountId?: number): number[] {
  const account = forAccount(accountId);
  const rows = db.all<{ day: number; spending: number }>(
    `SELECT CAST(substr(date, 9, 2) AS INTEGER) AS day, -SUM(amount) AS spending
     FROM transactions_view
     WHERE excluded = 0 AND flow = 'expense' AND date BETWEEN ? AND ?${account.sql}
     GROUP BY day`,
    [monthStart(month), monthEnd(month), ...account.params],
  );
  const days = new Array<number>(daysInMonth(month)).fill(0);
  for (const row of rows) days[row.day - 1] = row.spending;
  return days;
}

export interface CategoryAmount {
  /** `null` for bookings without a category — as are then `name` and `slug`. */
  categoryId: number | null;
  /** The stored name; `categoryName()` in `src/i18n/names.ts` turns it into the one to show. */
  name: string | null;
  slug: string | null;
  icon: string;
  amount: number;
  count: number;
}

function byCategory(
  db: Db,
  flow: "expense" | "income",
  from: IsoDate,
  to: IsoDate,
  accountId: number | undefined,
): CategoryAmount[] {
  const account = forAccount(accountId);
  const sign = flow === "expense" ? "-" : "";
  return db.all<CategoryAmount>(
    `SELECT
       category_id AS categoryId,
       category_name AS name,
       category_slug AS slug,
       COALESCE(category_icon, 'CircleDashed') AS icon,
       ${sign}SUM(amount) AS amount,
       COUNT(*) AS count
     FROM transactions_view
     WHERE excluded = 0 AND flow = ? AND date BETWEEN ? AND ?${account.sql}
     GROUP BY category_id
     ORDER BY amount DESC, name`,
    [flow, from, to, ...account.params],
  );
}

/** Net spending per category, largest first. */
export function getSpendingByCategory(
  db: Db,
  from: IsoDate,
  to: IsoDate,
  accountId?: number,
): CategoryAmount[] {
  return byCategory(db, "expense", from, to, accountId);
}

export function getIncomeByCategory(
  db: Db,
  from: IsoDate,
  to: IsoDate,
  accountId?: number,
): CategoryAmount[] {
  return byCategory(db, "income", from, to, accountId);
}

export interface MerchantAmount {
  merchantKey: string;
  merchant: string;
  amount: number;
  count: number;
  categoryName: string | null;
  categoryIcon: string | null;
}

/** The merchants most money went to, by net spending. */
export function getTopMerchants(
  db: Db,
  from: IsoDate,
  to: IsoDate,
  limit: number,
  accountId?: number,
): MerchantAmount[] {
  const account = forAccount(accountId);
  return db.all<MerchantAmount>(
    `SELECT
       merchant_key AS merchantKey,
       MAX(merchant) AS merchant,
       -SUM(amount) AS amount,
       COUNT(*) AS count,
       MAX(category_name) AS categoryName,
       MAX(category_icon) AS categoryIcon
     FROM transactions_view
     WHERE excluded = 0 AND flow = 'expense' AND date BETWEEN ? AND ?${account.sql}
     GROUP BY merchant_key
     HAVING SUM(amount) < 0
     ORDER BY amount DESC, merchant
     LIMIT ?`,
    [from, to, ...account.params, limit],
  );
}

/**
 * The savings rate: the share of income that was not spent, in whole percent.
 * Negative when more was spent than came in; `null` without income.
 */
export function savingsRate(income: number, spending: number): number | null {
  if (income <= 0) return null;
  return Math.round(((income - spending) * 100) / income);
}

export interface MonthSaved {
  month: IsoMonth;
  saved: number;
}

/**
 * What was put aside, per month: money moved into savings accounts, plus
 * bookings in "Savings & Investments" (pillar 3a, savings plans …) from any
 * other account.
 *
 * On a savings account, every transfer counts — in as saved, out as taken
 * back. Unpaired bookings in "Savings & Investments" there do not: they move
 * money from one savings pot to another (pillar 3a, a fund).
 *
 * On other accounts, a "Savings & Investments" booking counts only while it is
 * not paired with the other side of a transfer: a paired one is counted on
 * the savings account it went to — or, between two everyday accounts, is no
 * saving at all.
 */
export function getSavedByMonth(
  db: Db,
  fromMonth: IsoMonth,
  toMonth: IsoMonth,
  accountId?: number,
): MonthSaved[] {
  const account = forAccount(accountId);
  const rows = db.all<{ month: string; saved: number }>(
    `SELECT
       substr(v.date, 1, 7) AS month,
       SUM(CASE
         WHEN a.is_savings = 1 THEN v.amount
         ELSE -v.amount
       END) AS saved
     FROM transactions_view v
     JOIN accounts a ON a.id = v.account_id
     WHERE v.excluded = 0 AND v.date BETWEEN ? AND ?${account.sql}
       AND (
         (a.is_savings = 1 AND v.flow = 'transfer'
           AND (v.transfer_id IS NOT NULL OR COALESCE(v.category_slug, '') != 'savings'))
         OR (a.is_savings = 0 AND v.category_slug = 'savings' AND v.transfer_id IS NULL)
       )
     GROUP BY month`,
    [monthStart(fromMonth), monthEnd(toMonth), ...account.params],
  );
  const byMonth = new Map(rows.map((row) => [row.month, row.saved]));
  return monthRange(fromMonth, toMonth).map((month) => ({ month, saved: byMonth.get(month) ?? 0 }));
}

/** Total of `getSavedByMonth` over whole months. */
export function getSaved(db: Db, fromMonth: IsoMonth, toMonth: IsoMonth, accountId?: number): number {
  return getSavedByMonth(db, fromMonth, toMonth, accountId).reduce((sum, month) => sum + month.saved, 0);
}

/**
 * Average monthly net spending per category over the months before `month`.
 *
 * Looks back at most `lookback` months and uses only those the data covers
 * from the first day to the last — a month with a few days of data would
 * drag every average down. Without such a month there are no averages.
 */
export function getAverageSpendingByCategory(
  db: Db,
  month: IsoMonth,
  coverage: { from: IsoDate; to: IsoDate },
  lookback = 3,
): Map<number, number> {
  const complete = monthRange(addMonths(month, -lookback), addMonths(month, -1)).filter(
    (candidate) => coverage.from <= monthStart(candidate) && coverage.to >= monthEnd(candidate),
  );
  const averages = new Map<number, number>();
  if (complete.length === 0) return averages;

  // complete months are contiguous: the data has one start and one end
  const rows = db.all<{ categoryId: number; total: number }>(
    `SELECT category_id AS categoryId, -SUM(amount) AS total
     FROM transactions_view
     WHERE excluded = 0 AND flow = 'expense' AND category_id IS NOT NULL
       AND date BETWEEN ? AND ?
     GROUP BY category_id`,
    [monthStart(complete[0]), monthEnd(complete[complete.length - 1])],
  );
  for (const row of rows) {
    if (row.total > 0) averages.set(row.categoryId, Math.round(row.total / complete.length));
  }
  return averages;
}
