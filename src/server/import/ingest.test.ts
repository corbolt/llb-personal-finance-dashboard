import { beforeEach, describe, expect, it } from "vitest";

import { openDb, type Db } from "../db";
import { buildExport, cardText, creditText, paymentText, type LedgerEntry } from "./fixture";
import { deleteImport, ImportError, ingestExport } from "./ingest";

let db: Db;
beforeEach(() => {
  db = openDb(":memory:");
});

/** A small month of bookings, oldest first. References make overlaps detectable. */
const march: LedgerEntry[] = [
  { reference: 101, bookedAt: "2026-03-02T06:00:00", text: creditText(["BEISPIEL SCHWEIZ AG", "BAHNHOFPLATZ 11 CH 4410 LIESTAL", "Salarzahlung"]), amount: 5200 },
  { reference: 102, bookedAt: "2026-03-02T07:10:00", text: paymentText(["Muster Immobilien AG", "9490 Vaduz", "Liechtenstein", "Miete Beispielweg 3"]), amount: -1800 },
  { reference: 103, bookedAt: "2026-03-04T04:30:00", valueDate: "2026-03-02", text: cardText("Coop-6272 Eschen Essane", "9492 Eschen", "2026-03-02T17:20:11"), amount: -64.35 },
  { reference: 104, bookedAt: "2026-03-04T04:31:00", valueDate: "2026-03-03", text: cardText("Hofladen Beispiel", "9493 Mauren", "2026-03-03T09:02:40"), amount: -8.4 },
  { reference: 105, bookedAt: "2026-03-05T11:00:00", text: "E-Banking Kontoübertrag\nAuftragsnummer: 105", amount: -400 },
  { reference: 106, bookedAt: "2026-03-06T04:20:00", valueDate: "2026-03-05", text: cardText("Hofladen Beispiel", "9493 Mauren", "2026-03-05T16:45:00"), amount: -12.1 },
];

const seqOrder = () =>
  db.all<{ reference: string }>("SELECT reference FROM transactions ORDER BY seq").map((r) => r.reference);

const chainBreaks = () =>
  db.get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM (
       SELECT amount, balance, LAG(balance) OVER (ORDER BY seq) AS previous FROM transactions
     ) WHERE previous IS NOT NULL AND previous + amount != balance`,
  )!.n;

describe("ingestExport", () => {
  it("imports a first export and creates the account", () => {
    const result = ingestExport(db, { filename: "export.xlsx", data: buildExport(march) });

    expect(result).toMatchObject({
      accountName: "LLB account",
      rowCount: 6,
      inserted: 6,
      duplicates: 0,
      planned: 0,
      dateFrom: "2026-03-02",
      dateTo: "2026-03-06",
      uncategorised: 0,
      fileOrder: "newest-first",
    });
    expect(result.importId).not.toBeNull();
    expect(seqOrder()).toEqual(["101", "102", "103", "104", "105", "106"]);
    expect(chainBreaks()).toBe(0);

    const account = db.get<{ name: string; currency: string }>("SELECT name, currency FROM accounts");
    expect(account).toEqual({ name: "LLB account", currency: "CHF" });
  });

  it("stores each booking with its category and effective date", () => {
    ingestExport(db, { filename: "export.xlsx", data: buildExport(march) });
    const rows = db.all<{ reference: string; date: string; merchant: string; slug: string | null; flow: string }>(
      `SELECT reference, date, merchant, category_slug AS slug, flow
       FROM transactions_view ORDER BY seq`,
    );
    expect(rows).toEqual([
      { reference: "101", date: "2026-03-02", merchant: "Beispiel Schweiz AG", slug: "salary", flow: "income" },
      { reference: "102", date: "2026-03-02", merchant: "Muster Immobilien AG", slug: "housing", flow: "expense" },
      { reference: "103", date: "2026-03-02", merchant: "Coop", slug: "groceries", flow: "expense" },
      { reference: "104", date: "2026-03-03", merchant: "Hofladen Beispiel", slug: "groceries", flow: "expense" },
      { reference: "105", date: "2026-03-05", merchant: "Account transfer", slug: "transfer", flow: "transfer" },
      { reference: "106", date: "2026-03-05", merchant: "Hofladen Beispiel", slug: "groceries", flow: "expense" },
    ]);
  });

  it("adds nothing when the same file is uploaded twice", () => {
    const data = buildExport(march);
    ingestExport(db, { filename: "export.xlsx", data });
    const again = ingestExport(db, { filename: "export.xlsx", data });

    expect(again).toMatchObject({ inserted: 0, duplicates: 6, importId: null });
    expect(db.get<{ n: number }>("SELECT COUNT(*) AS n FROM transactions")!.n).toBe(6);
    expect(db.get<{ n: number }>("SELECT COUNT(*) AS n FROM imports")!.n).toBe(1);
  });

  it("merges an overlapping follow-up export", () => {
    // first export: bookings 101–104, second: 103–106 (as cut from one ledger)
    ingestExport(db, { filename: "a.xlsx", data: buildExport(march.slice(0, 4)) });
    const openingOfSecond = 1000 + 5200 - 1800;
    const second = ingestExport(db, {
      filename: "b.xlsx",
      data: buildExport(march.slice(2), { openingBalance: openingOfSecond }),
    });

    expect(second).toMatchObject({ inserted: 2, duplicates: 2 });
    expect(seqOrder()).toEqual(["101", "102", "103", "104", "105", "106"]);
    expect(chainBreaks()).toBe(0);
  });

  it("slots in an older export that is imported later", () => {
    const openingOfLater = 1000 + 5200 - 1800 - 64.35;
    ingestExport(db, {
      filename: "later.xlsx",
      data: buildExport(march.slice(3), { openingBalance: openingOfLater }),
    });
    ingestExport(db, { filename: "earlier.xlsx", data: buildExport(march.slice(0, 4)) });

    expect(seqOrder()).toEqual(["101", "102", "103", "104", "105", "106"]);
    expect(chainBreaks()).toBe(0);
  });

  it("recognises bookings without reference numbers by their content", () => {
    ingestExport(db, { filename: "a.xlsx", data: buildExport(march) });
    const again = ingestExport(db, {
      filename: "b.xlsx",
      data: buildExport(march, { omit: ["reference"] }),
    });
    expect(again).toMatchObject({ inserted: 0, duplicates: 6 });
  });

  it("applies the user's rules to new bookings", () => {
    const dining = db.get<{ id: number }>("SELECT id FROM categories WHERE slug = 'dining'")!.id;
    db.run("INSERT INTO rules (match_type, pattern, category_id) VALUES ('merchant', 'hofladen beispiel', ?)", [dining]);

    const result = ingestExport(db, { filename: "export.xlsx", data: buildExport(march) });
    expect(result.uncategorised).toBe(0);
    const rows = db.all<{ slug: string; source: string }>(
      `SELECT category_slug AS slug, category_source AS source
       FROM transactions_view WHERE merchant_key = 'hofladen beispiel'`,
    );
    expect(rows).toEqual([
      { slug: "dining", source: "rule" },
      { slug: "dining", source: "rule" },
    ]);
  });

  it("keeps accounts apart", () => {
    ingestExport(db, { filename: "a.xlsx", data: buildExport(march) });
    const savings = db.run("INSERT INTO accounts (name, currency) VALUES ('Savings', 'CHF')").lastInsertRowid;

    expect(() => ingestExport(db, { filename: "b.xlsx", data: buildExport(march) })).toThrow(ImportError);

    // the same references may exist in another account
    const result = ingestExport(db, { filename: "b.xlsx", data: buildExport(march), accountId: savings });
    expect(result).toMatchObject({ accountName: "Savings", inserted: 6, duplicates: 0 });
  });

  it("rolls back completely when the file is unusable", () => {
    expect(() =>
      ingestExport(db, { filename: "notes.txt", data: new TextEncoder().encode("hello") }),
    ).toThrow(/No transaction table found/);
    expect(db.get<{ n: number }>("SELECT COUNT(*) AS n FROM accounts")!.n).toBe(0);
  });
});

describe("deleteImport", () => {
  it("removes exactly the bookings an import added", () => {
    const first = ingestExport(db, { filename: "a.xlsx", data: buildExport(march.slice(0, 4)) });
    const second = ingestExport(db, {
      filename: "b.xlsx",
      data: buildExport(march.slice(2), { openingBalance: 1000 + 5200 - 1800 }),
    });

    expect(deleteImport(db, second.importId!)).toBe(2);
    expect(seqOrder()).toEqual(["101", "102", "103", "104"]);
    expect(db.all("SELECT id FROM imports")).toEqual([{ id: first.importId }]);
  });
});
