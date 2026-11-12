import type { IsoDate } from "../../lib/dates";
import { parseMoneyInput } from "../../lib/money";
import type { Db, SqlValue } from "../db/database";

export type Flow = "expense" | "income" | "transfer";

export interface TransactionRow {
  id: number;
  accountId: number;
  date: IsoDate;
  bookedAt: string;
  valueDate: IsoDate | null;
  amount: number;
  currency: string;
  originalAmount: number | null;
  originalCurrency: string | null;
  kind: string;
  rawText: string;
  merchant: string;
  merchantKey: string;
  location: string | null;
  memo: string | null;
  cardLast4: string | null;
  reference: string | null;
  categoryId: number | null;
  categoryName: string | null;
  categorySlug: string | null;
  categoryIcon: string | null;
  categorySource: "none" | "auto" | "rule" | "manual";
  flow: Flow;
  note: string | null;
  excluded: number;
}

const COLUMNS = `
  id, account_id AS accountId, date, booked_at AS bookedAt, value_date AS valueDate,
  amount, currency, original_amount AS originalAmount, original_currency AS originalCurrency,
  kind, raw_text AS rawText, merchant, merchant_key AS merchantKey, location, memo,
  card_last4 AS cardLast4, reference, category_id AS categoryId,
  category_name AS categoryName, category_slug AS categorySlug, category_icon AS categoryIcon,
  category_source AS categorySource, flow, note, excluded`;

export interface TransactionFilter {
  /** Free text; also matches an exact amount such as `45.15`. */
  search?: string;
  /**
   * The categories whose name matches `search`. Given by a caller that shows
   * category names in another language than they are stored in; without it
   * the search looks at the stored names.
   */
  searchCategoryIds?: readonly number[];
  from?: IsoDate;
  to?: IsoDate;
  /** A category id, or `"none"` for bookings without a category. */
  category?: number | "none";
  flow?: Flow;
  accountId?: number;
  merchantKey?: string;
  /** Restrict to these booking ids (used for recurring payments). */
  ids?: readonly number[];
}

function buildWhere(filter: TransactionFilter): { where: string; params: Record<string, SqlValue> } {
  const clauses: string[] = [];
  const params: Record<string, SqlValue> = {};

  const search = filter.search?.trim();
  if (search) {
    const escaped = search.replace(/[\\%_]/g, (ch) => `\\${ch}`);
    params.search = `%${escaped}%`;
    const fields = ["merchant", "memo", "raw_text", "note"].map(
      (field) => `${field} LIKE :search ESCAPE '\\'`,
    );
    if (filter.searchCategoryIds) {
      params.searchCategories = JSON.stringify(filter.searchCategoryIds);
      fields.push("category_id IN (SELECT value FROM json_each(:searchCategories))");
    } else {
      fields.push("category_name LIKE :search ESCAPE '\\'");
    }
    const amount = /\d/.test(search) ? parseMoneyInput(search) : null;
    if (amount !== null) {
      params.searchAmount = Math.abs(amount);
      fields.push("ABS(amount) = :searchAmount");
    }
    clauses.push(`(${fields.join(" OR ")})`);
  }
  if (filter.from) {
    clauses.push("date >= :from");
    params.from = filter.from;
  }
  if (filter.to) {
    clauses.push("date <= :to");
    params.to = filter.to;
  }
  if (filter.category === "none") {
    clauses.push("category_id IS NULL");
  } else if (filter.category !== undefined) {
    clauses.push("category_id = :category");
    params.category = filter.category;
  }
  if (filter.flow) {
    clauses.push("flow = :flow");
    params.flow = filter.flow;
  }
  if (filter.accountId !== undefined) {
    clauses.push("account_id = :accountId");
    params.accountId = filter.accountId;
  }
  if (filter.merchantKey) {
    clauses.push("merchant_key = :merchantKey");
    params.merchantKey = filter.merchantKey;
  }
  if (filter.ids) {
    clauses.push("id IN (SELECT value FROM json_each(:ids))");
    params.ids = JSON.stringify(filter.ids);
  }

  return { where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", params };
}

export interface TransactionPage {
  rows: TransactionRow[];
  /** Number of bookings matching the filter, across all pages. */
  total: number;
  /** Sums over everything matching the filter (excluded bookings left out). */
  moneyIn: number;
  moneyOut: number;
}

export function listTransactions(
  db: Db,
  filter: TransactionFilter,
  page: { limit: number; offset?: number },
): TransactionPage {
  const { where, params } = buildWhere(filter);
  const rows = db.all<TransactionRow>(
    `SELECT ${COLUMNS} FROM transactions_view ${where}
     ORDER BY date DESC, seq DESC, id DESC
     LIMIT :limit OFFSET :offset`,
    { ...params, limit: page.limit, offset: page.offset ?? 0 },
  );
  const summary = db.get<{ total: number; moneyIn: number | null; moneyOut: number | null }>(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN amount > 0 AND excluded = 0 THEN amount END) AS moneyIn,
       -SUM(CASE WHEN amount < 0 AND excluded = 0 THEN amount END) AS moneyOut
     FROM transactions_view ${where}`,
    params,
  );
  return {
    rows,
    total: summary?.total ?? 0,
    moneyIn: summary?.moneyIn ?? 0,
    moneyOut: summary?.moneyOut ?? 0,
  };
}

export function getTransaction(db: Db, id: number): TransactionRow | undefined {
  return db.get<TransactionRow>(`SELECT ${COLUMNS} FROM transactions_view WHERE id = ?`, [id]);
}

export interface UncategorisedMerchant {
  merchantKey: string;
  merchant: string;
  count: number;
  /** Signed sum of the bookings. */
  total: number;
  lastDate: IsoDate;
  location: string | null;
  memo: string | null;
}

/** Merchants with bookings that still need a category, busiest first. */
export function getUncategorisedMerchants(db: Db): UncategorisedMerchant[] {
  return db.all<UncategorisedMerchant>(
    `SELECT
       merchant_key AS merchantKey,
       MAX(merchant) AS merchant,
       COUNT(*) AS count,
       SUM(amount) AS total,
       MAX(date) AS lastDate,
       MAX(location) AS location,
       MAX(memo) AS memo
     FROM transactions
     WHERE category_id IS NULL
     GROUP BY merchant_key
     ORDER BY count DESC, ABS(SUM(amount)) DESC`,
  );
}

export function countUncategorised(db: Db): number {
  return (
    db.get<{ n: number }>("SELECT COUNT(*) AS n FROM transactions WHERE category_id IS NULL")?.n ?? 0
  );
}
