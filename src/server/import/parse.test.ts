import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";

import { buildExport, cardText, paymentText } from "./fixture";
import { parseExport } from "./parse";
import {
  cellCurrency,
  cellToDateTime,
  cellToNumber,
  ImportFormatError,
  readWorkbook,
} from "./workbook";

describe("cell conversion", () => {
  it("converts Excel serial dates without touching time zones", () => {
    // 46337.206712962965 is what the bank's 2026-11-11T04:57:40 becomes
    expect(cellToDateTime({ value: 46337.206712962965 })).toEqual({
      date: "2026-11-11",
      time: "04:57:40",
    });
    expect(cellToDateTime({ value: 46335 })).toEqual({ date: "2026-11-09", time: "00:00:00" });
  });

  it("accepts ISO and Swiss date text", () => {
    expect(cellToDateTime({ value: "2026-11-11T04:57:40" })?.time).toBe("04:57:40");
    expect(cellToDateTime({ value: "2026-11-11" })?.date).toBe("2026-11-11");
    expect(cellToDateTime({ value: "09.11.2026" })?.date).toBe("2026-11-09");
    expect(cellToDateTime({ value: "9.11.26, 17:34:47" })).toEqual({
      date: "2026-11-09",
      time: "17:34:47",
    });
  });

  it("rejects impossible dates and non-dates", () => {
    expect(cellToDateTime({ value: "31.02.2026" })).toBeNull();
    expect(cellToDateTime({ value: "Total" })).toBeNull();
    expect(cellToDateTime(undefined)).toBeNull();
  });

  it("reads amounts from numbers and formatted text", () => {
    expect(cellToNumber({ value: -11.6 })).toBe(-11.6);
    expect(cellToNumber({ value: "1'234.50" })).toBe(1234.5);
    expect(cellToNumber({ value: "CHF -2’535.80" })).toBe(-2535.8);
    expect(cellToNumber({ value: "1.234,50" })).toBe(1234.5);
    expect(cellToNumber({ value: "n/a" })).toBeNull();
  });

  it("finds the currency in the number format", () => {
    expect(cellCurrency({ value: -55, format: "[$EUR] #,##0.00" })).toBe("EUR");
    expect(cellCurrency({ value: -55, format: "#,##0.00" })).toBeNull();
    expect(cellCurrency({ value: "USD 12.00" })).toBe("USD");
  });
});

describe("readWorkbook", () => {
  const entries = [
    { bookedAt: "2026-03-02T09:00:00", text: cardText("Coop-1 Vaduz", "9490 Vaduz", "2026-03-01T10:00:00"), amount: -12.5 },
  ];

  it("locates columns by header, in any order", () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      ["Betrag", "Buchungstext", "Etwas anderes", "Buchungsdatum"],
      [-5, "Gebühren\nTest", "x", "01.03.2026"],
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Export");
    const table = readWorkbook(new Uint8Array(XLSX.write(workbook, { type: "array", bookType: "xlsx" })));

    expect(table.columns).toEqual({
      amount: "Betrag",
      text: "Buchungstext",
      bookedAt: "Buchungsdatum",
    });
    expect(table.rows).toHaveLength(1);
    expect(table.rows[0].cells.amount?.value).toBe(-5);
  });

  it("skips title rows above the header", () => {
    const table = readWorkbook(buildExport(entries, { titleRows: ["Kontoauszug", "Privatkonto"] }));
    expect(table.rows).toHaveLength(1);
    expect(table.balanceCurrency).toBe("CHF");
  });

  it("explains what is wrong with an unusable file", () => {
    expect(() => readWorkbook(new TextEncoder().encode("Name;Wert\nA;1\n"))).toThrow(ImportFormatError);
    expect(() => readWorkbook(new Uint8Array([1, 2, 3, 4]))).toThrow(ImportFormatError);
  });
});

describe("parseExport", () => {
  it("normalises a card payment in a foreign currency", () => {
    const parsed = parseExport(
      buildExport([
        {
          bookedAt: "2026-03-05T04:57:40",
          valueDate: "2026-03-03",
          text: cardText("RESTAURANT SONNE", "06800 FELDKIRCH", "2026-03-03T18:45:49", "2792"),
          amount: -51.61,
          original: { amount: -55, currency: "EUR" },
          reference: 859869882,
        },
      ]),
    );
    expect(parsed.currency).toBe("CHF");
    expect(parsed.transactions).toHaveLength(1);
    expect(parsed.transactions[0]).toMatchObject({
      reference: "859869882",
      bookedAt: "2026-03-05T04:57:40",
      valueDate: "2026-03-03",
      date: "2026-03-03", // the purchase, not the booking two days later
      amount: -5161,
      currency: "CHF",
      originalAmount: -5500,
      originalCurrency: "EUR",
      balance: 94839,
      kind: "card",
      merchant: "Restaurant Sonne",
      merchantKey: "restaurant sonne",
      location: "Feldkirch",
      cardLast4: "2792",
    });
  });

  it("dates everything but card payments on the booking day", () => {
    const parsed = parseExport(
      buildExport([
        {
          bookedAt: "2026-03-02T17:54:38",
          valueDate: "2026-03-03",
          text: paymentText(["Telco SA", "1008 Prilly", "Switzerland"]),
          amount: -45.15,
        },
      ]),
    );
    expect(parsed.transactions[0].date).toBe("2026-03-02");
  });

  it("ignores an implausible purchase date", () => {
    const parsed = parseExport(
      buildExport([
        {
          bookedAt: "2026-03-05T04:00:00",
          valueDate: "2026-03-04",
          // a purchase "after" its booking cannot be right
          text: cardText("Coop-1 Vaduz", "9490 Vaduz", "2026-04-01T10:00:00"),
          amount: -9.9,
        },
      ]),
    );
    expect(parsed.transactions[0].date).toBe("2026-03-04");
  });

  it("reads ISO date cells exactly like the bank writes them", () => {
    const parsed = parseExport(
      buildExport(
        [
          {
            bookedAt: "2026-11-11T04:57:40",
            valueDate: "2026-11-09",
            text: cardText("Coop-1 Vaduz", "9490 Vaduz", "2026-11-09T17:34:47"),
            amount: -11.6,
          },
        ],
        { isoDateCells: true },
      ),
    );
    expect(parsed.transactions[0]).toMatchObject({
      bookedAt: "2026-11-11T04:57:40",
      valueDate: "2026-11-09",
      date: "2026-11-09",
    });
  });

  it("leaves out planned bookings and rows without data", () => {
    const data = buildExport([
      { bookedAt: "2026-03-01T08:00:00", text: "Gebühren\nKontoführung", amount: -5 },
      { bookedAt: "2026-03-09T08:00:00", text: "E-Banking Zahlung\nSpäter AG", amount: -80, planned: "Geplant" },
    ]);
    const parsed = parseExport(data);
    expect(parsed.transactions).toHaveLength(1);
    expect(parsed.plannedCount).toBe(1);
  });

  it("reports rows it cannot use instead of failing", () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      ["Buchungsdatum", "Buchungstext", "Betrag"],
      ["01.03.2026", "Gebühren\nKontoführung", -5],
      ["Total", "", -5],
      ["02.03.2026", "Gebühren\nOhne Betrag", ""],
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Export");
    const parsed = parseExport(new Uint8Array(XLSX.write(workbook, { type: "array", bookType: "xlsx" })));

    expect(parsed.transactions).toHaveLength(1);
    expect(parsed.skipped).toEqual([
      { rowNumber: 3, reason: "no booking date" },
      { rowNumber: 4, reason: "no amount" },
    ]);
  });

  it("fingerprints a booking the same with or without its reference column", () => {
    const entry = {
      bookedAt: "2026-03-02T09:00:00",
      text: cardText("Coop-1 Vaduz", "9490 Vaduz", "2026-03-01T10:00:00"),
      amount: -12.5,
    };
    const withReference = parseExport(buildExport([entry])).transactions[0];
    const without = parseExport(buildExport([entry], { omit: ["reference"] })).transactions[0];
    expect(withReference.reference).not.toBeNull();
    expect(without.reference).toBeNull();
    expect(without.fingerprint).toBe(withReference.fingerprint);
  });

  it("keeps identical rows apart when nothing else distinguishes them", () => {
    const entry = { bookedAt: "2026-03-02T09:00:00", text: "Gebühren\nSMS", amount: -0.2 };
    const parsed = parseExport(buildExport([entry, entry], { omit: ["reference", "balance"] }));
    const [first, second] = parsed.transactions.map((tx) => tx.fingerprint);
    expect(second).toBe(`${first}#2`);
  });
});
