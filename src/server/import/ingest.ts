import { createHash } from "node:crypto";

import type { Db } from "../db/database";
import { categorise, type CategoryLookup, type UserRule } from "./categorize";
import {
  mergeOrder,
  toChronological,
  type ExistingBooking,
  type FileOrder,
  type IncomingBooking,
} from "./order";
import { parseExport, type ParsedTransaction, type SkippedRow } from "./parse";

export interface IngestInput {
  filename: string;
  data: Uint8Array;
  /** Target account; may be omitted while there is at most one account. */
  accountId?: number;
}

export interface IngestResult {
  accountId: number;
  accountName: string;
  /** `null` when the file contained nothing new. */
  importId: number | null;
  /** Bookings found in the file. */
  rowCount: number;
  inserted: number;
  duplicates: number;
  skipped: SkippedRow[];
  planned: number;
  /** Booking date range covered by the file. */
  dateFrom: string | null;
  dateTo: string | null;
  /** Newly added bookings that no rule could categorise. */
  uncategorised: number;
  fileOrder: FileOrder;
}

export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportError";
  }
}

interface StoredRow extends ExistingBooking {
  reference: string | null;
  fingerprint: string;
  seq: number;
}

function resolveAccount(
  db: Db,
  accountId: number | undefined,
  sheetName: string,
  currency: string,
): { id: number; name: string } {
  if (accountId !== undefined) {
    const account = db.get<{ id: number; name: string }>(
      "SELECT id, name FROM accounts WHERE id = ?",
      [accountId],
    );
    if (!account) throw new ImportError("The selected account no longer exists.");
    return account;
  }

  const accounts = db.all<{ id: number; name: string }>("SELECT id, name FROM accounts ORDER BY id");
  if (accounts.length === 1) return accounts[0];
  if (accounts.length > 1) {
    throw new ImportError("Choose which account this export belongs to.");
  }

  const generic = /^(sheet|tabelle|feuil|foglio)\s*\d*$/i.test(sheetName.trim());
  const name = generic || sheetName.trim() === "" ? "Main account" : `${sheetName.trim()} account`;
  const created = db.run("INSERT INTO accounts (name, currency) VALUES (?, ?)", [name, currency]);
  return { id: created.lastInsertRowid, name };
}

export function loadUserRules(db: Db): UserRule[] {
  return db.all<UserRule>(
    `SELECT match_type AS matchType, pattern, category_id AS categoryId
     FROM rules ORDER BY id`,
  );
}

export function loadCategoryLookup(db: Db): CategoryLookup {
  const rows = db.all<{ id: number; slug: string }>(
    "SELECT id, slug FROM categories WHERE slug IS NOT NULL",
  );
  return { idBySlug: new Map(rows.map((row) => [row.slug, row.id])) };
}

/**
 * Imports a bank export: parses it, skips bookings that are already stored,
 * categorises the new ones and slots them into the account's booking order.
 * Everything happens in one database transaction.
 */
export function ingestExport(db: Db, input: IngestInput): IngestResult {
  const parsed = parseExport(input.data);
  const { rows: chronological, order: fileOrder } = toChronological(parsed.transactions);

  const bookedDays = chronological.map((tx) => tx.bookedAt.slice(0, 10)).sort();
  const dateFrom = bookedDays[0] ?? null;
  const dateTo = bookedDays[bookedDays.length - 1] ?? null;

  return db.transaction(() => {
    const account = resolveAccount(db, input.accountId, parsed.sheetName, parsed.currency);

    const stored = db.all<StoredRow>(
      `SELECT id, reference, fingerprint, seq, substr(booked_at, 1, 10) AS bookedDay,
              amount, balance
       FROM transactions WHERE account_id = ? ORDER BY seq`,
      [account.id],
    );
    const idByReference = new Map<string, number>();
    const idByFingerprint = new Map<string, number>();
    for (const row of stored) {
      if (row.reference !== null) idByReference.set(row.reference, row.id);
      idByFingerprint.set(row.fingerprint, row.id);
    }

    // Match every row of the file against what is stored — and against the
    // rows before it, in case the file itself repeats a booking.
    const fresh: ParsedTransaction[] = [];
    const incoming: IncomingBooking[] = [];
    const seenReferences = new Set<string>();
    const seenFingerprints = new Set<string>();
    let duplicates = 0;

    for (const tx of chronological) {
      const existingId =
        (tx.reference !== null ? idByReference.get(tx.reference) : undefined) ??
        idByFingerprint.get(tx.fingerprint) ??
        null;
      const repeated =
        (tx.reference !== null && seenReferences.has(tx.reference)) ||
        seenFingerprints.has(tx.fingerprint);
      if (existingId === null && repeated) {
        duplicates += 1;
        continue;
      }
      if (tx.reference !== null) seenReferences.add(tx.reference);
      seenFingerprints.add(tx.fingerprint);
      if (existingId !== null) duplicates += 1;
      else fresh.push(tx);
      incoming.push({
        existingId,
        bookedDay: tx.bookedAt.slice(0, 10),
        amount: tx.amount,
        balance: tx.balance,
      });
    }

    const result: IngestResult = {
      accountId: account.id,
      accountName: account.name,
      importId: null,
      rowCount: parsed.transactions.length,
      inserted: fresh.length,
      duplicates,
      skipped: parsed.skipped,
      planned: parsed.plannedCount,
      dateFrom,
      dateTo,
      uncategorised: 0,
      fileOrder,
    };
    if (fresh.length === 0) return result;

    const importRow = db.run(
      `INSERT INTO imports
         (account_id, filename, file_hash, row_count, inserted_count, duplicate_count,
          skipped_count, date_from, date_to)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        account.id,
        input.filename,
        createHash("sha256").update(input.data).digest("hex"),
        parsed.transactions.length,
        fresh.length,
        duplicates,
        parsed.skipped.length,
        dateFrom,
        dateTo,
      ],
    );
    result.importId = importRow.lastInsertRowid;

    const rules = loadUserRules(db);
    const lookup = loadCategoryLookup(db);
    const storedSeq = new Map(stored.map((row) => [row.id, row.seq]));

    // `incoming` and `fresh` are in the same order, so the n-th "new" slot
    // belongs to the n-th fresh transaction.
    const freshByIncomingIndex = new Map<number, ParsedTransaction>();
    let next = 0;
    incoming.forEach((row, index) => {
      if (row.existingId === null) freshByIncomingIndex.set(index, fresh[next++]);
    });

    mergeOrder(stored, incoming).forEach((slot, seq) => {
      if (slot.type === "existing") {
        if (storedSeq.get(slot.id) !== seq) {
          db.run("UPDATE transactions SET seq = ? WHERE id = ?", [seq, slot.id]);
        }
        return;
      }
      const tx = freshByIncomingIndex.get(slot.index)!;
      const category = categorise(
        {
          kind: tx.kind,
          amount: tx.amount,
          merchantKey: tx.merchantKey,
          merchantName: tx.merchant,
          brand: tx.brand,
          memo: tx.memo,
          rawText: tx.rawText,
        },
        rules,
        lookup,
      );
      if (category.categoryId === null) result.uncategorised += 1;

      db.run(
        `INSERT INTO transactions
           (account_id, import_id, seq, reference, fingerprint, booked_at, value_date, date,
            amount, currency, original_amount, original_currency, balance, kind, raw_text,
            merchant, merchant_key, location, memo, card_last4, category_id, category_source)
         VALUES
           (:account_id, :import_id, :seq, :reference, :fingerprint, :booked_at, :value_date, :date,
            :amount, :currency, :original_amount, :original_currency, :balance, :kind, :raw_text,
            :merchant, :merchant_key, :location, :memo, :card_last4, :category_id, :category_source)`,
        {
          account_id: account.id,
          import_id: result.importId,
          seq,
          reference: tx.reference,
          fingerprint: tx.fingerprint,
          booked_at: tx.bookedAt,
          value_date: tx.valueDate,
          date: tx.date,
          amount: tx.amount,
          currency: tx.currency,
          original_amount: tx.originalAmount,
          original_currency: tx.originalCurrency,
          balance: tx.balance,
          kind: tx.kind,
          raw_text: tx.rawText,
          merchant: tx.merchant,
          merchant_key: tx.merchantKey,
          location: tx.location,
          memo: tx.memo,
          card_last4: tx.cardLast4,
          category_id: category.categoryId,
          category_source: category.source,
        },
      );
    });

    return result;
  });
}

/** Removes an import together with the bookings it added. */
export function deleteImport(db: Db, importId: number): number {
  return db.transaction(() => {
    const removed = db.run("DELETE FROM transactions WHERE import_id = ?", [importId]);
    db.run("DELETE FROM imports WHERE id = ?", [importId]);
    return removed.changes;
  });
}
