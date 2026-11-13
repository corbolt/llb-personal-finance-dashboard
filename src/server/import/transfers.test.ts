import { beforeEach, describe, expect, it } from "vitest";

import { openDb, type Db } from "../db";
import { setAccountSavings } from "../mutations";
import { getSaved, getTotals } from "../queries/flows";
import { countUncategorised, getTransaction } from "../queries/transactions";
import { buildExport, creditText, paymentText, type LedgerEntry } from "./fixture";
import { deleteImport, ingestExport } from "./ingest";
import { pairTransfers, unpairTransfer } from "./transfers";

/** How the bank words a transfer: only the other account, nothing about the transfer itself. */
const toSavings = paymentText(["Erika Beispiel", "Sparkonto 1234.5678", "Übertrag"]);
const fromChecking = creditText(["Erika Beispiel", "Privatkonto 1234.5677"]);

let db: Db;
let checking: number;
let savings: number;

beforeEach(() => {
  db = openDb(":memory:");
  checking = db.run("INSERT INTO accounts (name) VALUES ('Checking')").lastInsertRowid;
  savings = db.run("INSERT INTO accounts (name) VALUES ('Savings')").lastInsertRowid;
});

function load(accountId: number, entries: LedgerEntry[]) {
  return ingestExport(db, { filename: `${accountId}.xlsx`, accountId, data: buildExport(entries) });
}

const idOf = (reference: number) =>
  db.get<{ id: number }>("SELECT id FROM transactions WHERE reference = ?", [String(reference)])!.id;
const partnerOf = (reference: number) => getTransaction(db, idOf(reference))!.transferId;

describe("transfer pairs", () => {
  it("pairs bookings with consecutive references, whichever file comes first", () => {
    load(savings, [{ reference: 860263736, bookedAt: "2026-03-05T11:00:00", text: fromChecking, amount: 1000 }]);
    expect(partnerOf(860263736)).toBeNull();

    const result = load(checking, [
      { reference: 860263735, bookedAt: "2026-03-04T11:00:00", text: toSavings, amount: -1000 },
    ]);
    expect(partnerOf(860263735)).toBe(idOf(860263736));
    expect(partnerOf(860263736)).toBe(idOf(860263735));
    expect(result.uncategorised).toBe(0);
  });

  it("counts a paired booking as a transfer, whatever it looks like", () => {
    load(checking, [
      { reference: 100, bookedAt: "2026-03-04T11:00:00", text: toSavings, amount: -1000 },
      { reference: 102, bookedAt: "2026-03-25T06:00:00", text: creditText(["BEISPIEL AG", "Lohn"]), amount: 5000 },
    ]);
    load(savings, [{ reference: 101, bookedAt: "2026-03-04T11:00:00", text: fromChecking, amount: 1000 }]);

    const totals = getTotals(db, "2026-03-01", "2026-03-31");
    expect(totals.income).toBe(500000); // the salary only, not the money moved to savings
    expect(totals.spending).toBe(0);
    expect(getTransaction(db, idOf(101))!.flow).toBe("transfer");
    expect(countUncategorised(db)).toBe(0);
  });

  it("lets consecutive references settle what amount and day leave open", () => {
    load(checking, [
      { reference: 200, bookedAt: "2026-03-04T11:00:00", text: toSavings, amount: -500 },
      { reference: 202, bookedAt: "2026-03-04T12:00:00", text: toSavings, amount: -500 },
    ]);
    load(savings, [
      { reference: 203, bookedAt: "2026-03-04T12:00:00", text: fromChecking, amount: 500 },
      { reference: 201, bookedAt: "2026-03-04T11:00:00", text: fromChecking, amount: 500 },
    ]);
    expect(partnerOf(200)).toBe(idOf(201));
    expect(partnerOf(202)).toBe(idOf(203));
  });

  it("pairs without references only when the match is the only one", () => {
    load(checking, [
      { reference: 300, bookedAt: "2026-03-04T11:00:00", text: toSavings, amount: -250 },
      // two equal amounts on one day, and nothing to tell them apart
      { reference: 310, bookedAt: "2026-03-10T11:00:00", text: toSavings, amount: -80 },
      { reference: 320, bookedAt: "2026-03-10T12:00:00", text: toSavings, amount: -80 },
      // a day apart and not consecutive: too weak on its own
      { reference: 330, bookedAt: "2026-03-20T11:00:00", text: toSavings, amount: -40 },
    ]);
    load(savings, [
      { reference: 900, bookedAt: "2026-03-04T11:00:00", text: fromChecking, amount: 250 },
      { reference: 910, bookedAt: "2026-03-10T11:00:00", text: fromChecking, amount: 80 },
      { reference: 930, bookedAt: "2026-03-21T11:00:00", text: fromChecking, amount: 40 },
    ]);
    expect(partnerOf(300)).toBe(idOf(900));
    expect(partnerOf(310)).toBeNull();
    expect(partnerOf(320)).toBeNull();
    expect(partnerOf(910)).toBeNull();
    expect(partnerOf(330)).toBeNull();
  });

  it("counts money moved to a savings account once, even when filed under savings", () => {
    setAccountSavings(db, savings, true);
    const savingsPlan = paymentText(["Erika Beispiel", "Sparkonto 1234.5678", "Sparplan"]);
    load(checking, [{ reference: 700, bookedAt: "2026-03-04T11:00:00", text: savingsPlan, amount: -300 }]);
    expect(getSaved(db, "2026-03", "2026-03")).toBe(30000); // the savings account is not imported yet

    load(savings, [{ reference: 701, bookedAt: "2026-03-04T11:00:00", text: fromChecking, amount: 300 }]);
    expect(getSaved(db, "2026-03", "2026-03")).toBe(30000);
  });

  it("never pairs bookings on the same account", () => {
    load(checking, [
      { reference: 400, bookedAt: "2026-03-04T11:00:00", text: toSavings, amount: -60 },
      { reference: 401, bookedAt: "2026-03-04T12:00:00", text: fromChecking, amount: 60 },
    ]);
    expect(partnerOf(400)).toBeNull();
  });

  it("keeps a pair apart once the user took it apart", () => {
    load(checking, [{ reference: 500, bookedAt: "2026-03-04T11:00:00", text: toSavings, amount: -1000 }]);
    load(savings, [{ reference: 501, bookedAt: "2026-03-04T11:00:00", text: fromChecking, amount: 1000 }]);

    unpairTransfer(db, idOf(501));
    expect(partnerOf(500)).toBeNull();
    expect(partnerOf(501)).toBeNull();
    expect(pairTransfers(db)).toBe(0);
    // without the pair, the money coming in counts by its category again
    expect(getTransaction(db, idOf(501))!.flow).toBe("income");
  });

  it("frees the other side when an import is undone, and pairs it again on re-import", () => {
    load(checking, [{ reference: 600, bookedAt: "2026-03-04T11:00:00", text: toSavings, amount: -1000 }]);
    const first = load(savings, [
      { reference: 601, bookedAt: "2026-03-04T11:00:00", text: fromChecking, amount: 1000 },
    ]);

    deleteImport(db, first.importId!);
    expect(partnerOf(600)).toBeNull();

    load(savings, [{ reference: 601, bookedAt: "2026-03-04T11:00:00", text: fromChecking, amount: 1000 }]);
    expect(partnerOf(600)).toBe(idOf(601));
  });
});
