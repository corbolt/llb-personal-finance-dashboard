import type { Db } from "./db/database";
import type { CategoryKind } from "./db/default-categories";
import { UserFacingError } from "./errors";
import type { BookingKind } from "./import/booking-text";
import { categorise } from "./import/categorize";
import { loadCategoryLookup, loadUserRules } from "./import/ingest";
import { brandForKey, type Cadence } from "./import/merchants";
import { fold } from "./import/text";

/** A change the user asked for that cannot be made, and why. */
export class UserError extends UserFacingError {
  override name = "UserError";
}

function requireCategory(db: Db, id: number): { id: number; name: string; kind: CategoryKind } {
  const category = db.get<{ id: number; name: string; kind: CategoryKind }>(
    "SELECT id, name, kind FROM categories WHERE id = ?",
    [id],
  );
  if (!category) throw new UserError("error.categoryGone");
  return category;
}

/* ------------------------------------------------------------------ */
/* Transactions                                                        */
/* ------------------------------------------------------------------ */

export interface CategoryChange {
  /** Bookings whose category changed. */
  updated: number;
  merchant: string;
  /** How many bookings the merchant has in total. */
  merchantTotal: number;
}

/**
 * Sets the category of one booking — or, with scope `merchant`, of every
 * booking from the same merchant, remembering the choice as a rule for
 * future imports. A `null` category clears it.
 */
export function setTransactionCategory(
  db: Db,
  transactionId: number,
  categoryId: number | null,
  scope: "one" | "merchant",
): CategoryChange {
  return db.transaction(() => {
    const tx = db.get<{ merchant: string; merchantKey: string }>(
      "SELECT merchant, merchant_key AS merchantKey FROM transactions WHERE id = ?",
      [transactionId],
    );
    if (!tx) throw new UserError("error.transactionGone");
    if (categoryId !== null) requireCategory(db, categoryId);
    const merchantTotal =
      db.get<{ n: number }>("SELECT COUNT(*) AS n FROM transactions WHERE merchant_key = ?", [
        tx.merchantKey,
      ])?.n ?? 0;

    if (scope === "one") {
      const result = db.run(
        `UPDATE transactions
         SET category_id = ?, category_source = ?, updated_at = datetime('now')
         WHERE id = ?`,
        [categoryId, categoryId === null ? "none" : "manual", transactionId],
      );
      return { updated: result.changes, merchant: tx.merchant, merchantTotal };
    }

    if (categoryId === null) {
      db.run("DELETE FROM rules WHERE match_type = 'merchant' AND pattern = ?", [tx.merchantKey]);
    } else {
      db.run(
        `INSERT INTO rules (match_type, pattern, category_id) VALUES ('merchant', ?, ?)
         ON CONFLICT (match_type, pattern) DO UPDATE SET category_id = excluded.category_id`,
        [tx.merchantKey, categoryId],
      );
    }
    const result = db.run(
      `UPDATE transactions
       SET category_id = ?, category_source = ?, updated_at = datetime('now')
       WHERE merchant_key = ?`,
      [categoryId, categoryId === null ? "none" : "rule", tx.merchantKey],
    );
    return { updated: result.changes, merchant: tx.merchant, merchantTotal };
  });
}

/** Same as recategorising one booking of the merchant with scope `merchant`. */
export function setMerchantCategory(db: Db, merchantKey: string, categoryId: number): CategoryChange {
  const tx = db.get<{ id: number }>(
    "SELECT id FROM transactions WHERE merchant_key = ? LIMIT 1",
    [merchantKey],
  );
  if (!tx) throw new UserError("error.merchantWithoutTransactions");
  return setTransactionCategory(db, tx.id, categoryId, "merchant");
}

export function setTransactionNote(db: Db, transactionId: number, note: string): void {
  const trimmed = note.trim();
  db.run("UPDATE transactions SET note = ?, updated_at = datetime('now') WHERE id = ?", [
    trimmed === "" ? null : trimmed.slice(0, 500),
    transactionId,
  ]);
}

export function setTransactionExcluded(db: Db, transactionId: number, excluded: boolean): void {
  db.run("UPDATE transactions SET excluded = ?, updated_at = datetime('now') WHERE id = ?", [
    excluded ? 1 : 0,
    transactionId,
  ]);
}

/**
 * Re-runs categorisation for every booking the user has not categorised by
 * hand. Needed after rules change. Returns how many bookings changed.
 */
export function recategoriseAll(db: Db): number {
  return db.transaction(() => {
    const rules = loadUserRules(db);
    const lookup = loadCategoryLookup(db);
    const rows = db.all<{
      id: number;
      kind: string;
      amount: number;
      merchantKey: string;
      merchant: string;
      memo: string | null;
      rawText: string;
      categoryId: number | null;
      categorySource: string;
    }>(
      `SELECT id, kind, amount, merchant_key AS merchantKey, merchant, memo,
              raw_text AS rawText, category_id AS categoryId, category_source AS categorySource
       FROM transactions WHERE category_source != 'manual'`,
    );

    let changed = 0;
    for (const row of rows) {
      const next = categorise(
        {
          kind: row.kind as BookingKind,
          amount: row.amount,
          merchantKey: row.merchantKey,
          merchantName: row.merchant,
          brand: brandForKey(row.merchantKey),
          memo: row.memo,
          rawText: row.rawText,
        },
        rules,
        lookup,
      );
      if (next.categoryId === row.categoryId && next.source === row.categorySource) continue;
      db.run(
        `UPDATE transactions
         SET category_id = ?, category_source = ?, updated_at = datetime('now')
         WHERE id = ?`,
        [next.categoryId, next.source, row.id],
      );
      changed += 1;
    }
    return changed;
  });
}

/* ------------------------------------------------------------------ */
/* Rules                                                               */
/* ------------------------------------------------------------------ */

/** Adds a "booking text contains …" rule and applies it right away. */
export function createTextRule(db: Db, text: string, categoryId: number): number {
  const pattern = fold(text);
  if (pattern.length < 3) {
    throw new UserError("error.ruleTooShort");
  }
  return db.transaction(() => {
    requireCategory(db, categoryId);
    db.run(
      `INSERT INTO rules (match_type, pattern, category_id) VALUES ('text', ?, ?)
       ON CONFLICT (match_type, pattern) DO UPDATE SET category_id = excluded.category_id`,
      [pattern, categoryId],
    );
    return recategoriseAll(db);
  });
}

export function deleteRule(db: Db, ruleId: number): number {
  return db.transaction(() => {
    db.run("DELETE FROM rules WHERE id = ?", [ruleId]);
    return recategoriseAll(db);
  });
}

/* ------------------------------------------------------------------ */
/* Categories                                                          */
/* ------------------------------------------------------------------ */

export interface CategoryInput {
  name: string;
  kind: CategoryKind;
  icon: string;
}

function cleanCategoryInput(input: CategoryInput): CategoryInput {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length === 0) throw new UserError("error.categoryNameMissing");
  if (name.length > 40) throw new UserError("error.categoryNameTooLong");
  return { ...input, name };
}

function rethrowDuplicateName(error: unknown, name: string): never {
  if (error instanceof Error && /UNIQUE constraint failed: categories\.name/.test(error.message)) {
    throw new UserError("error.categoryNameTaken", { name });
  }
  throw error;
}

export function createCategory(db: Db, input: CategoryInput): number {
  const { name, kind, icon } = cleanCategoryInput(input);
  try {
    return db.run(
      `INSERT INTO categories (name, kind, icon, sort_order)
       VALUES (?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM categories))`,
      [name, kind, icon],
    ).lastInsertRowid;
  } catch (error) {
    rethrowDuplicateName(error, name);
  }
}

export function updateCategory(db: Db, id: number, input: CategoryInput): void {
  const { name, kind, icon } = cleanCategoryInput(input);
  requireCategory(db, id);
  try {
    db.transaction(() => {
      db.run("UPDATE categories SET name = ?, kind = ?, icon = ? WHERE id = ?", [name, kind, icon, id]);
      // a budget only makes sense for spending
      if (kind !== "expense") db.run("DELETE FROM budgets WHERE category_id = ?", [id]);
    });
  } catch (error) {
    rethrowDuplicateName(error, name);
  }
}

/** Deletes a category; its bookings become uncategorised, its rules go too. */
export function deleteCategory(db: Db, id: number): void {
  db.transaction(() => {
    db.run("UPDATE transactions SET category_source = 'none' WHERE category_id = ?", [id]);
    db.run("DELETE FROM categories WHERE id = ?", [id]);
  });
}

/* ------------------------------------------------------------------ */
/* Budgets                                                             */
/* ------------------------------------------------------------------ */

/** Sets the monthly budget of a spending category; `null` or 0 removes it. */
export function setBudget(db: Db, categoryId: number, amount: number | null): void {
  if (amount === null || amount <= 0) {
    db.run("DELETE FROM budgets WHERE category_id = ?", [categoryId]);
    return;
  }
  const category = requireCategory(db, categoryId);
  if (category.kind !== "expense") {
    throw new UserError("error.budgetNeedsSpendingCategory");
  }
  db.run(
    `INSERT INTO budgets (category_id, amount) VALUES (?, ?)
     ON CONFLICT (category_id) DO UPDATE SET amount = excluded.amount`,
    [categoryId, Math.round(amount)],
  );
}

/* ------------------------------------------------------------------ */
/* Accounts                                                            */
/* ------------------------------------------------------------------ */

function cleanAccountName(name: string): string {
  const cleaned = name.trim().replace(/\s+/g, " ");
  if (cleaned.length === 0) throw new UserError("error.accountNameMissing");
  return cleaned.slice(0, 60);
}

export function createAccount(db: Db, name: string, currency = "CHF"): number {
  return db.run("INSERT INTO accounts (name, currency) VALUES (?, ?)", [
    cleanAccountName(name),
    currency.toUpperCase().slice(0, 3),
  ]).lastInsertRowid;
}

export function renameAccount(db: Db, accountId: number, name: string): void {
  db.run("UPDATE accounts SET name = ? WHERE id = ?", [cleanAccountName(name), accountId]);
}

/** Deletes an account, which is only possible while it holds no bookings. */
export function deleteEmptyAccount(db: Db, accountId: number): void {
  db.transaction(() => {
    const used = db.get<{ n: number }>(
      "SELECT COUNT(*) AS n FROM transactions WHERE account_id = ?",
      [accountId],
    );
    if (used && used.n > 0) {
      throw new UserError("error.accountNotEmpty");
    }
    db.run("DELETE FROM accounts WHERE id = ?", [accountId]);
  });
}

/* ------------------------------------------------------------------ */
/* Recurring payments                                                  */
/* ------------------------------------------------------------------ */

export type RecurringDirection = "out" | "in";

/** Tells the detector that a merchant is never recurring. */
export function ignoreRecurring(db: Db, merchantKey: string, direction: RecurringDirection): void {
  db.run(
    `INSERT INTO recurring_overrides (merchant_key, direction, decision, cadence)
     VALUES (?, ?, 'ignore', NULL)
     ON CONFLICT (merchant_key, direction)
     DO UPDATE SET decision = 'ignore', cadence = NULL`,
    [merchantKey, direction],
  );
}

/** Tells the detector that a merchant always recurs at the given cadence. */
export function forceRecurring(
  db: Db,
  merchantKey: string,
  direction: RecurringDirection,
  cadence: Cadence,
): void {
  db.run(
    `INSERT INTO recurring_overrides (merchant_key, direction, decision, cadence)
     VALUES (?, ?, 'force', ?)
     ON CONFLICT (merchant_key, direction)
     DO UPDATE SET decision = 'force', cadence = excluded.cadence`,
    [merchantKey, direction, cadence],
  );
}

export function clearRecurringOverride(
  db: Db,
  merchantKey: string,
  direction: RecurringDirection,
): void {
  db.run("DELETE FROM recurring_overrides WHERE merchant_key = ? AND direction = ?", [
    merchantKey,
    direction,
  ]);
}
