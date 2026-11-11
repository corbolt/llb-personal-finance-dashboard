import * as XLSX from "xlsx";

/**
 * Reads a bank export workbook into loosely typed rows.
 *
 * The LLB online-banking export (written by AG Grid) has one sheet with a
 * header row. Columns are located by their header text rather than position,
 * because the grid lets users hide and reorder columns before exporting.
 */

export type ColumnKey =
  | "bookedAt"
  | "planned"
  | "text"
  | "reference"
  | "valueDate"
  | "amount"
  | "originalAmount"
  | "balance"
  | "receipt"
  | "bankCategory"
  | "fxRate";

export interface SourceCell {
  /** Raw value: number, string, boolean or Date. `undefined` for empty cells. */
  value: unknown;
  /** Excel number format of the cell, e.g. `[$CHF] #,##0.00`. */
  format?: string;
}

export interface SourceRow {
  /** 1-based row number in the sheet, for error messages. */
  rowNumber: number;
  cells: Partial<Record<ColumnKey, SourceCell>>;
}

export interface SourceTable {
  sheetName: string;
  /** Header text for each recognised column. */
  columns: Partial<Record<ColumnKey, string>>;
  /** Currency named in the balance header (`Saldo in CHF`), if any. */
  balanceCurrency: string | null;
  rows: SourceRow[];
}

export class ImportFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportFormatError";
  }
}

const HEADER_ALIASES: Record<Exclude<ColumnKey, "balance">, string[]> = {
  bookedAt: ["buchungsdatum", "booking date", "date de comptabilisation", "data di registrazione"],
  planned: ["geplante umsätze", "geplante umsatze", "planned transactions", "pending"],
  text: ["buchungstext", "booking text", "text", "beschreibung", "description"],
  reference: ["referenz-nr.", "referenz-nr", "referenznummer", "reference no.", "reference number"],
  valueDate: ["valutadatum", "valuta", "value date"],
  amount: ["betrag", "amount", "montant", "importo"],
  originalAmount: [
    "betrag in referenzwährung",
    "betrag in referenzwahrung",
    "amount in reference currency",
  ],
  receipt: ["beleg", "receipt", "document"],
  bankCategory: ["kategorie", "category"],
  fxRate: ["umrechnungskurs", "exchange rate"],
};

const BALANCE_HEADER = /^(?:saldo|balance|solde)(?:\s+in\s+([a-z]{3}))?$/i;

const REQUIRED: ColumnKey[] = ["bookedAt", "text", "amount"];

function normaliseHeader(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase().replace(/\s+/g, " ") : "";
}

function matchHeader(header: string): { key: ColumnKey; currency?: string } | null {
  if (!header) return null;
  const balance = BALANCE_HEADER.exec(header);
  if (balance) return { key: "balance", currency: balance[1]?.toUpperCase() };
  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.includes(header)) return { key: key as ColumnKey };
  }
  return null;
}

function isBlank(cell: XLSX.CellObject | undefined): boolean {
  if (!cell || cell.v === undefined || cell.v === null) return true;
  return typeof cell.v === "string" && cell.v.trim() === "";
}

export function readWorkbook(data: Uint8Array): SourceTable {
  let workbook: XLSX.WorkBook;
  try {
    // cellDates stays off: date cells then arrive as Excel serial numbers,
    // which convert to calendar dates with plain arithmetic — no time zones.
    workbook = XLSX.read(data, { type: "array", cellNF: true, cellDates: false });
  } catch {
    throw new ImportFormatError(
      "This file could not be read as a spreadsheet. Please upload the .xlsx export from your online banking.",
    );
  }

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const table = sheet ? readSheet(sheetName, sheet) : null;
    if (table) return table;
  }

  throw new ImportFormatError(
    "No transaction table found. The export needs the columns “Buchungsdatum”, “Buchungstext” and “Betrag”.",
  );
}

function readSheet(sheetName: string, sheet: XLSX.WorkSheet): SourceTable | null {
  const ref = sheet["!ref"];
  if (!ref) return null;
  const range = XLSX.utils.decode_range(ref);

  // The header is normally the first row; scan a little further in case the
  // file was re-saved with a title above the table.
  const lastHeaderCandidate = Math.min(range.e.r, range.s.r + 15);
  for (let r = range.s.r; r <= lastHeaderCandidate; r++) {
    const columnIndex = new Map<ColumnKey, number>();
    const columns: Partial<Record<ColumnKey, string>> = {};
    let balanceCurrency: string | null = null;

    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })] as XLSX.CellObject | undefined;
      const match = matchHeader(normaliseHeader(cell?.v));
      if (!match || columnIndex.has(match.key)) continue;
      columnIndex.set(match.key, c);
      columns[match.key] = String(cell?.v).trim();
      if (match.key === "balance" && match.currency) balanceCurrency = match.currency;
    }

    if (!REQUIRED.every((key) => columnIndex.has(key))) continue;

    const rows: SourceRow[] = [];
    for (let dataRow = r + 1; dataRow <= range.e.r; dataRow++) {
      const cells: Partial<Record<ColumnKey, SourceCell>> = {};
      let hasContent = false;
      for (const [key, c] of columnIndex) {
        const cell = sheet[XLSX.utils.encode_cell({ r: dataRow, c })] as
          | XLSX.CellObject
          | undefined;
        if (isBlank(cell)) continue;
        hasContent = true;
        cells[key] = { value: cell!.v, format: typeof cell!.z === "string" ? cell!.z : undefined };
      }
      if (hasContent) rows.push({ rowNumber: dataRow + 1, cells });
    }
    return { sheetName, columns, balanceCurrency, rows };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Cell value conversion                                               */
/* ------------------------------------------------------------------ */

const EXCEL_EPOCH_OFFSET_DAYS = 25_569; // days from 1899-12-30 to 1970-01-01

export interface DateTimeParts {
  /** `YYYY-MM-DD` */
  date: string;
  /** `HH:MM:SS` */
  time: string;
}

function partsFromUtc(ms: number): DateTimeParts | null {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  const iso = d.toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 19) };
}

/** Converts a spreadsheet date cell to calendar date and wall-clock time. */
export function cellToDateTime(cell: SourceCell | undefined): DateTimeParts | null {
  if (!cell) return null;
  const { value } = cell;

  if (typeof value === "number" && Number.isFinite(value)) {
    // Excel serial date: whole days since 1899-12-30, time as day fraction.
    const seconds = Math.round((value - EXCEL_EPOCH_OFFSET_DAYS) * 86_400);
    return partsFromUtc(seconds * 1000);
  }

  if (value instanceof Date) {
    return partsFromUtc(value.getTime());
  }

  if (typeof value === "string") {
    const text = value.trim();
    // ISO: 2026-11-11 or 2026-11-11T04:57:40
    let m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(text);
    if (m) {
      return validParts(+m[1], +m[2], +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
    }
    // Swiss: 11.11.2026 or 11.11.26, optionally followed by a time
    m = /^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(text);
    if (m) {
      const year = m[3].length === 2 ? 2000 + +m[3] : +m[3];
      return validParts(year, +m[2], +m[1], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
    }
  }
  return null;
}

function validParts(
  y: number,
  mo: number,
  d: number,
  h: number,
  mi: number,
  s: number,
): DateTimeParts | null {
  const ms = Date.UTC(y, mo - 1, d, h, mi, s);
  const check = new Date(ms);
  if (
    check.getUTCFullYear() !== y ||
    check.getUTCMonth() !== mo - 1 ||
    check.getUTCDate() !== d
  ) {
    return null;
  }
  return partsFromUtc(ms);
}

/** Converts an amount cell to a number; accepts `1'234.50` and `1.234,50` text. */
export function cellToNumber(cell: SourceCell | undefined): number | null {
  if (!cell) return null;
  const { value } = cell;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;

  let text = value.replace(/[\s'’` ]/g, "").replace(/[A-Za-z$€£]/g, "");
  text = text.replace(/−/g, "-");
  if (text === "") return null;
  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");
  text = lastComma > lastDot ? text.replace(/\./g, "").replace(",", ".") : text.replace(/,/g, "");
  if (!/^[-+]?\d*\.?\d+$/.test(text)) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * The export encodes the currency only in the cell's number format
 * (`[$EUR] #,##0.00`); a text cell may also carry it as a prefix.
 */
export function cellCurrency(cell: SourceCell | undefined): string | null {
  if (!cell) return null;
  const fromFormat = cell.format ? /\[\$([A-Za-z]{3})[\]-]/.exec(cell.format) : null;
  if (fromFormat) return fromFormat[1].toUpperCase();
  if (typeof cell.value === "string") {
    const fromText = /\b([A-Z]{3})\b/.exec(cell.value);
    if (fromText) return fromText[1];
  }
  return null;
}

export function cellToText(cell: SourceCell | undefined): string | null {
  if (!cell || cell.value === undefined || cell.value === null) return null;
  const { value } = cell;
  if (typeof value === "string") {
    const text = value.replace(/\r\n?/g, "\n").trim();
    return text === "" ? null : text;
  }
  return String(value);
}
