import type { IsoDate } from "../../lib/dates";
import type { Db } from "../db/database";

export interface AccountSummary {
  id: number;
  name: string;
  currency: string;
  /** Money moved into a savings account counts as saved. */
  isSavings: boolean;
  /** Balance after the most recent booking, if the export carried balances. */
  balance: number | null;
  /** Booking day of the most recent booking. */
  balanceDate: IsoDate | null;
  transactionCount: number;
  firstDate: IsoDate | null;
  lastDate: IsoDate | null;
}

export function listAccounts(db: Db): AccountSummary[] {
  return db.all<Omit<AccountSummary, "isSavings"> & { isSavings: number }>(
    `SELECT
       a.id, a.name, a.currency, a.is_savings AS isSavings,
       latest.balance AS balance,
       substr(latest.booked_at, 1, 10) AS balanceDate,
       COALESCE(stats.n, 0) AS transactionCount,
       stats.firstDate, stats.lastDate
     FROM accounts a
     LEFT JOIN (
       SELECT account_id, COUNT(*) AS n, MIN(date) AS firstDate, MAX(date) AS lastDate,
              MAX(seq) AS lastSeq
       FROM transactions GROUP BY account_id
     ) stats ON stats.account_id = a.id
     LEFT JOIN transactions latest
       ON latest.account_id = a.id AND latest.seq = stats.lastSeq
     ORDER BY a.id`,
  ).map((account) => ({ ...account, isSavings: account.isSavings === 1 }));
}

export interface DataRange {
  /** Earliest and latest day on which money was spent or received. */
  firstDate: IsoDate | null;
  lastDate: IsoDate | null;
  /**
   * The day up to which the data is complete: the latest booking day. It can
   * be later than `lastDate`, because card payments are booked a few days
   * after the purchase they are dated by.
   */
  coveredThrough: IsoDate | null;
  transactionCount: number;
}

/** The span of dates for which there is any data at all — in one account, if given. */
export function getDataRange(db: Db, accountId?: number): DataRange {
  const row = db.get<DataRange>(
    `SELECT MIN(date) AS firstDate, MAX(date) AS lastDate,
            MAX(MAX(date), MAX(substr(booked_at, 1, 10))) AS coveredThrough,
            COUNT(*) AS transactionCount
     FROM transactions
     ${accountId === undefined ? "" : "WHERE account_id = ?"}`,
    accountId === undefined ? [] : [accountId],
  );
  return row ?? { firstDate: null, lastDate: null, coveredThrough: null, transactionCount: 0 };
}

export interface BalancePoint {
  date: IsoDate;
  balance: number;
}

/**
 * Closing balance of each booking day. Uses the bank's booking order, because
 * the last booking of a day is not the one with the latest timestamp.
 */
export function getBalanceSeries(db: Db, accountId: number): BalancePoint[] {
  return db.all<BalancePoint>(
    `SELECT substr(t.booked_at, 1, 10) AS date, t.balance AS balance
     FROM transactions t
     JOIN (
       SELECT substr(booked_at, 1, 10) AS day, MAX(seq) AS lastSeq
       FROM transactions
       WHERE account_id = ? AND balance IS NOT NULL
       GROUP BY day
     ) closing ON closing.lastSeq = t.seq
     WHERE t.account_id = ?
     ORDER BY date`,
    [accountId, accountId],
  );
}

export interface BalanceGap {
  accountId: number;
  accountName: string;
  /** Last booking day before the gap and first one after it. */
  afterDate: IsoDate;
  beforeDate: IsoDate;
  /** Sum of the bookings that must be missing in between. */
  missingAmount: number;
}

/**
 * Places where the running balance does not carry over from one stored
 * booking to the next — a sign that bookings in between were never imported
 * (the bank's export is capped at a number of rows).
 */
export function findBalanceGaps(db: Db): BalanceGap[] {
  return db.all<BalanceGap>(
    `SELECT
       chain.account_id AS accountId,
       a.name AS accountName,
       chain.previousDay AS afterDate,
       chain.day AS beforeDate,
       chain.balance - chain.amount - chain.previousBalance AS missingAmount
     FROM (
       SELECT
         account_id, amount, balance,
         substr(booked_at, 1, 10) AS day,
         LAG(balance) OVER w AS previousBalance,
         LAG(substr(booked_at, 1, 10)) OVER w AS previousDay
       FROM transactions
       WHERE balance IS NOT NULL
       WINDOW w AS (PARTITION BY account_id ORDER BY seq)
     ) chain
     JOIN accounts a ON a.id = chain.account_id
     WHERE chain.previousBalance IS NOT NULL
       AND chain.previousBalance + chain.amount != chain.balance
     ORDER BY chain.account_id, chain.day`,
  );
}

export interface ImportRecord {
  id: number;
  accountId: number;
  accountName: string;
  filename: string;
  importedAt: string;
  rowCount: number;
  insertedCount: number;
  duplicateCount: number;
  dateFrom: IsoDate | null;
  dateTo: IsoDate | null;
  /** Bookings from this import that are still stored. */
  remaining: number;
}

export function listImports(db: Db): ImportRecord[] {
  return db.all<ImportRecord>(
    `SELECT
       i.id, i.account_id AS accountId, a.name AS accountName, i.filename,
       i.imported_at AS importedAt, i.row_count AS rowCount,
       i.inserted_count AS insertedCount, i.duplicate_count AS duplicateCount,
       i.date_from AS dateFrom, i.date_to AS dateTo,
       (SELECT COUNT(*) FROM transactions t WHERE t.import_id = i.id) AS remaining
     FROM imports i
     JOIN accounts a ON a.id = i.account_id
     ORDER BY i.id DESC`,
  );
}
