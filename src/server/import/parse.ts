import { createHash } from "node:crypto";

import { diffDays } from "../../lib/dates";
import { toCents } from "../../lib/money";
import { parseBookingText, type BookingKind } from "./booking-text";
import { normaliseMerchant, type Brand } from "./merchants";
import {
  cellCurrency,
  cellToDateTime,
  cellToNumber,
  cellToText,
  readWorkbook,
  type SourceRow,
} from "./workbook";

export interface ParsedTransaction {
  /** Row in the spreadsheet, for diagnostics. */
  rowNumber: number;
  reference: string | null;
  /** Content hash used to recognise the booking when no reference is exported. */
  fingerprint: string;
  /** `YYYY-MM-DDTHH:MM:SS` */
  bookedAt: string;
  valueDate: string | null;
  /** The day the money was spent or received. */
  date: string;
  /** Signed, in minor units. */
  amount: number;
  currency: string;
  originalAmount: number | null;
  originalCurrency: string | null;
  balance: number | null;
  kind: BookingKind;
  rawText: string;
  merchant: string;
  merchantKey: string;
  brand: Brand | null;
  location: string | null;
  memo: string | null;
  cardLast4: string | null;
}

export interface SkippedRow {
  rowNumber: number;
  reason: string;
}

export interface ParsedExport {
  sheetName: string;
  /** Currency the account is kept in. */
  currency: string;
  /** In the order the file lists them. */
  transactions: ParsedTransaction[];
  skipped: SkippedRow[];
  /** Rows flagged as planned (not yet booked), which are left out. */
  plannedCount: number;
}

/** A card purchase is booked a few days after it happens — never months. */
const MAX_BOOKING_DELAY_DAYS = 45;

function effectiveDate(
  kind: BookingKind,
  bookedDate: string,
  valueDate: string | null,
  purchaseDate: string | null,
): string {
  if (kind !== "card") return bookedDate;
  for (const candidate of [purchaseDate, valueDate]) {
    if (!candidate) continue;
    const delay = diffDays(candidate, bookedDate);
    if (delay >= 0 && delay <= MAX_BOOKING_DELAY_DAYS) return candidate;
  }
  return bookedDate;
}

function parseRow(
  row: SourceRow,
  fallbackCurrency: string,
): ParsedTransaction | { skip: string } | { planned: true } {
  const { cells } = row;

  if (cellToText(cells.planned)) return { planned: true };

  const booked = cellToDateTime(cells.bookedAt) ?? cellToDateTime(cells.valueDate);
  if (!booked) return { skip: "no booking date" };

  const amountValue = cellToNumber(cells.amount);
  if (amountValue === null) return { skip: "no amount" };

  const rawText = cellToText(cells.text) ?? "";
  const details = parseBookingText(rawText);
  const merchant = normaliseMerchant(details.counterparty, details.kind);

  const value = cellToDateTime(cells.valueDate);
  const originalValue = cellToNumber(cells.originalAmount);
  const originalCurrency = cellCurrency(cells.originalAmount);
  const balanceValue = cellToNumber(cells.balance);

  const amount = toCents(amountValue);
  const balance = balanceValue === null ? null : toCents(balanceValue);
  const bookedAt = `${booked.date}T${booked.time}`;
  const valueDate = value?.date ?? null;

  return {
    rowNumber: row.rowNumber,
    reference: cellToText(cells.reference),
    fingerprint: "",
    bookedAt,
    valueDate,
    date: effectiveDate(details.kind, booked.date, valueDate, details.purchaseDate),
    amount,
    currency: cellCurrency(cells.amount) ?? fallbackCurrency,
    originalAmount:
      originalValue !== null && originalCurrency ? toCents(originalValue) : null,
    originalCurrency: originalValue !== null ? originalCurrency : null,
    balance,
    kind: details.kind,
    rawText,
    merchant: merchant.name,
    merchantKey: merchant.key,
    brand: merchant.brand,
    location: details.location,
    memo: details.memo,
    cardLast4: details.cardLast4,
  };
}

/**
 * The reference number is deliberately left out: a booking must hash the same
 * whether or not the reference column was part of the export.
 */
function fingerprintOf(tx: ParsedTransaction): string {
  return createHash("sha256")
    .update([tx.bookedAt, tx.valueDate ?? "", tx.amount, tx.balance ?? "", tx.rawText].join("\u001f"))
    .digest("hex")
    .slice(0, 32);
}

function mostCommon(values: string[]): string | null {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  let best: string | null = null;
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

/** Reads a bank export file into normalised transactions. */
export function parseExport(data: Uint8Array): ParsedExport {
  const table = readWorkbook(data);
  const fallbackCurrency = table.balanceCurrency ?? "CHF";

  const transactions: ParsedTransaction[] = [];
  const skipped: SkippedRow[] = [];
  let plannedCount = 0;

  for (const row of table.rows) {
    const parsed = parseRow(row, fallbackCurrency);
    if ("planned" in parsed) {
      plannedCount += 1;
    } else if ("skip" in parsed) {
      skipped.push({ rowNumber: row.rowNumber, reason: parsed.skip });
    } else {
      transactions.push(parsed);
    }
  }

  // Identical rows (possible only when neither reference nor balance is
  // exported) get a running number so each keeps its own fingerprint.
  const seen = new Map<string, number>();
  for (const tx of transactions) {
    const base = fingerprintOf(tx);
    const occurrence = (seen.get(base) ?? 0) + 1;
    seen.set(base, occurrence);
    tx.fingerprint = occurrence === 1 ? base : `${base}#${occurrence}`;
  }

  return {
    sheetName: table.sheetName,
    currency:
      table.balanceCurrency ?? mostCommon(transactions.map((tx) => tx.currency)) ?? "CHF",
    transactions,
    skipped,
    plannedCount,
  };
}
