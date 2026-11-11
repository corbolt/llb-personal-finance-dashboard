import * as XLSX from "xlsx";

/**
 * Test support: builds workbooks shaped like the bank's export (same headers,
 * newest booking first, currency carried by the number format) from made-up
 * bookings, so the test-suite never needs real account data.
 */

export interface LedgerEntry {
  /** `YYYY-MM-DDTHH:MM:SS` */
  bookedAt: string;
  text: string;
  amount: number;
  reference?: string | number | null;
  /** Defaults to the booking day. */
  valueDate?: string;
  /** Foreign-currency amount shown in the "reference currency" column. */
  original?: { amount: number; currency: string };
  planned?: string;
}

export interface ExportOptions {
  /** Balance before the first entry. */
  openingBalance?: number;
  /** Leave out columns, as a user can do in the banking grid. */
  omit?: Array<"reference" | "balance" | "valueDate">;
  /** Write the rows oldest-first instead of the bank's newest-first. */
  ascending?: boolean;
  /** Store dates as ISO date cells (`t="d"`), the way the bank's grid does. */
  isoDateCells?: boolean;
  /** Extra rows above the header. */
  titleRows?: string[];
  currency?: string;
}

const HEADERS = {
  bookedAt: "Buchungsdatum",
  planned: "Geplante Umsätze",
  text: "Buchungstext",
  reference: "Referenz-Nr.",
  valueDate: "Valutadatum",
  amount: "Betrag",
  original: "Betrag in Referenzwährung",
  balance: "Saldo in CHF",
  receipt: "Beleg",
  category: "Kategorie",
  fxRate: "Umrechnungskurs",
} as const;

type ColumnId = keyof typeof HEADERS;

function utcMillis(iso: string): number {
  const [date, time = "00:00:00"] = iso.split("T");
  const [y, m, d] = date.split("-").map(Number);
  const [h, mi, s] = time.split(":").map(Number);
  return Date.UTC(y, m - 1, d, h, mi, s);
}

function dateCell(iso: string, asIsoCell: boolean): XLSX.CellObject {
  const ms = utcMillis(iso);
  return asIsoCell
    ? { t: "d", v: new Date(ms), z: "DD.MM.YYYY" }
    : { t: "n", v: ms / 86_400_000 + 25_569, z: "DD.MM.YYYY" };
}

const money = (value: number, currency: string): XLSX.CellObject => ({
  t: "n",
  v: value,
  z: `[$${currency}] #,##0.00`,
});
const text = (value: string): XLSX.CellObject => ({ t: "s", v: value });

/** Counter for generated reference numbers; unique within a test run. */
let nextReference = 700_000_001;

/**
 * @param entries bookings in the order they happened (oldest first)
 */
export function buildExport(entries: LedgerEntry[], options: ExportOptions = {}): Uint8Array {
  const { openingBalance = 1000, omit = [], ascending = false, isoDateCells = false } = options;
  const currency = options.currency ?? "CHF";

  const columns = (Object.keys(HEADERS) as ColumnId[]).filter(
    (id) => !(omit as string[]).includes(id),
  );

  let balanceCents = Math.round(openingBalance * 100);
  const rows = entries.map((entry) => {
    balanceCents += Math.round(entry.amount * 100);
    const cells: Record<ColumnId, XLSX.CellObject> = {
      bookedAt: dateCell(entry.bookedAt, isoDateCells),
      planned: text(entry.planned ?? ""),
      text: text(entry.text),
      reference:
        entry.reference === null
          ? text("")
          : { t: "n", v: Number(entry.reference ?? nextReference++) },
      valueDate: dateCell(entry.valueDate ?? entry.bookedAt.slice(0, 10), isoDateCells),
      amount: money(entry.amount, currency),
      original: entry.original ? money(entry.original.amount, entry.original.currency) : text(""),
      balance: { t: "n", v: balanceCents / 100, z: "#,##0.00" },
      receipt: text(""),
      category: text(""),
      fxRate: text(""),
    };
    return columns.map((id) => cells[id]);
  });
  if (!ascending) rows.reverse();

  const sheetRows: XLSX.CellObject[][] = [
    ...(options.titleRows ?? []).map((title) => [text(title)]),
    columns.map((id) => text(HEADERS[id])),
    ...rows,
  ];

  const sheet = XLSX.utils.aoa_to_sheet(sheetRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "LLB");
  const written = XLSX.write(workbook, { type: "array", bookType: "xlsx", cellDates: isoDateCells });
  return new Uint8Array(written as ArrayBuffer);
}

/* ---- booking text builders ------------------------------------------------ */

export function cardText(merchant: string, place: string, when: string, last4 = "1234"): string {
  const [date, time] = when.split("T");
  const [y, m, d] = date.split("-");
  return `${merchant}, ${place}\n${d}.${m}.${y.slice(2)} / ${time}\nKartennummer XXXX XXXX XXXX ${last4}`;
}

export function paymentText(lines: string[], order = 800_000_001): string {
  return ["E-Banking Zahlung", ...lines, "", `Auftragsnummer: ${order}`].join("\n");
}

export function creditText(lines: string[], order = 800_000_002): string {
  return ["Gutschrift", ...lines, `Auftragsnummer: ${order}`].join("\n");
}
