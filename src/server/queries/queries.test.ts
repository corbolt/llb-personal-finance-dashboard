import { beforeEach, describe, expect, it } from "vitest";

import { openDb, type Db } from "../db";
import { buildExport, cardText, creditText, paymentText, type LedgerEntry } from "../import/fixture";
import { ingestExport } from "../import/ingest";
import {
  createCategory,
  createTextRule,
  deleteCategory,
  deleteEmptyAccount,
  deleteRule,
  forceRecurring,
  ignoreRecurring,
  setBudget,
  setMerchantCategory,
  setTransactionCategory,
  setTransactionExcluded,
  updateCategory,
  UserError,
} from "../mutations";
import { findBalanceGaps, getBalanceSeries, getDataRange, listAccounts, listImports } from "./accounts";
import { getBudgetOverview } from "./budgets";
import { listCategories, listCategoriesWithUsage, listRules } from "./categories";
import {
  getAverageSpendingByCategory,
  getDailySpending,
  getIncomeByCategory,
  getMonthlyTotals,
  getSpendingByCategory,
  getTopMerchants,
  getTotals,
} from "./flows";
import { getRecurring, listIgnoredRecurring, upcomingCharges } from "./recurring";
import { countUncategorised, getUncategorisedMerchants, listTransactions } from "./transactions";

const salary = creditText(["BEISPIEL SCHWEIZ AG", "BAHNHOFPLATZ 11 CH 4410 LIESTAL", "Salarzahlung"]);
const rent = paymentText(["Muster Immobilien AG", "9490 Vaduz", "Liechtenstein", "Miete Beispielweg 3"]);
const coop = (when: string) => cardText("Coop-6272 Eschen Essane", "9492 Eschen", when);

/** Two months of bookings, oldest first; the balance starts at 1000.00. */
const ledger: LedgerEntry[] = [
  { reference: 201, bookedAt: "2026-02-25T06:00:00", text: salary, amount: 5000 },
  { reference: 202, bookedAt: "2026-02-26T07:00:00", text: rent, amount: -1800 },
  { reference: 203, bookedAt: "2026-02-27T04:00:00", valueDate: "2026-02-26", text: coop("2026-02-26T18:00:00"), amount: -100 },
  // bought on the last day of February, booked in March
  { reference: 204, bookedAt: "2026-03-02T04:00:00", valueDate: "2026-02-28", text: coop("2026-02-28T11:00:00"), amount: -50 },
  { reference: 205, bookedAt: "2026-03-03T04:00:00", valueDate: "2026-03-02", text: cardText("Hofladen Beispiel", "9493 Mauren", "2026-03-02T09:00:00"), amount: -20 },
  { reference: 206, bookedAt: "2026-03-05T11:00:00", text: "E-Banking Kontoübertrag\nAuftragsnummer: 206", amount: -400 },
  { reference: 207, bookedAt: "2026-03-10T04:00:00", valueDate: "2026-03-09", text: cardText("RESTAURANT SONNE", "9490 VADUZ", "2026-03-09T19:30:00"), amount: -80 },
  // a refund on the card
  { reference: 208, bookedAt: "2026-03-12T04:00:00", valueDate: "2026-03-11", text: coop("2026-03-11T10:00:00"), amount: 30 },
  { reference: 209, bookedAt: "2026-03-25T06:00:00", text: salary, amount: 5000 },
  { reference: 210, bookedAt: "2026-03-26T07:00:00", text: rent, amount: -1800 },
  { reference: 211, bookedAt: "2026-03-27T09:00:00", text: paymentText(["Erika Beispiel", "Seeweg 4", "9495 Triesen", "Liechtenstein"]), amount: -150 },
];

let db: Db;
beforeEach(() => {
  db = openDb(":memory:");
  ingestExport(db, { filename: "export.xlsx", data: buildExport(ledger) });
});

const categoryId = (slug: string) =>
  db.get<{ id: number }>("SELECT id FROM categories WHERE slug = ?", [slug])!.id;
const idOf = (reference: number) =>
  db.get<{ id: number }>("SELECT id FROM transactions WHERE reference = ?", [String(reference)])!.id;

describe("flows", () => {
  it("totals a month by the day the money was spent", () => {
    expect(getTotals(db, "2026-03-01", "2026-03-31")).toEqual({
      income: 500000,
      // farm shop 20 + restaurant 80 − refund 30 + rent 1800 + private payment 150
      spending: 202000,
      net: 298000,
      transactionCount: 7,
    });
    // the purchase of 28 February belongs to February although booked in March
    expect(getTotals(db, "2026-02-01", "2026-02-28").spending).toBe(195000);
  });

  it("leaves transfers and excluded bookings out of the totals", () => {
    setTransactionExcluded(db, idOf(207), true);
    expect(getTotals(db, "2026-03-01", "2026-03-31").spending).toBe(194000);
    setTransactionExcluded(db, idOf(207), false);
    expect(getTotals(db, "2026-03-01", "2026-03-31").spending).toBe(202000);
  });

  it("lists every month in a range, including empty ones", () => {
    expect(getMonthlyTotals(db, "2026-01", "2026-04")).toEqual([
      { month: "2026-01", income: 0, spending: 0 },
      { month: "2026-02", income: 500000, spending: 195000 },
      { month: "2026-03", income: 500000, spending: 202000 },
      { month: "2026-04", income: 0, spending: 0 },
    ]);
  });

  it("breaks spending down by day", () => {
    const days = getDailySpending(db, "2026-03");
    expect(days).toHaveLength(31);
    expect(days[1]).toBe(2000); // 2 March
    expect(days[8]).toBe(8000); // 9 March
    expect(days[10]).toBe(-3000); // the refund on 11 March
    expect(days.reduce((sum, value) => sum + value, 0)).toBe(202000);
  });

  it("ranks categories by net spending", () => {
    expect(
      getSpendingByCategory(db, "2026-03-01", "2026-03-31").map((c) => [c.name, c.amount, c.count]),
    ).toEqual([
      ["Housing", 180000, 1],
      [null, 15000, 1], // no category: the interface names it
      ["Dining & Drinks", 8000, 1],
      ["Groceries", -1000, 2], // the refund outweighs the farm shop
    ]);
    // the slug is what lets the interface show a built-in category in its own language
    expect(getIncomeByCategory(db, "2026-03-01", "2026-03-31")).toMatchObject([
      { name: "Salary", slug: "salary", amount: 500000, count: 1 },
    ]);
  });

  it("ranks merchants and drops those that only refunded", () => {
    expect(
      getTopMerchants(db, "2026-03-01", "2026-03-31", 10).map((m) => [m.merchant, m.amount, m.count]),
    ).toEqual([
      ["Muster Immobilien AG", 180000, 1],
      ["Erika Beispiel", 15000, 1],
      ["Restaurant Sonne", 8000, 1],
      ["Hofladen Beispiel", 2000, 1],
    ]);
  });

  it("narrows every aggregate to one account", () => {
    const savings = db.run("INSERT INTO accounts (name) VALUES ('Savings')").lastInsertRowid;
    ingestExport(db, {
      filename: "savings.xlsx",
      accountId: savings,
      data: buildExport([
        { reference: 901, bookedAt: "2026-03-09T04:00:00", valueDate: "2026-03-08", text: coop("2026-03-08T10:00:00"), amount: -70 },
      ]),
    });
    const main = listAccounts(db)[0].id;

    expect(getTotals(db, "2026-03-01", "2026-03-31").spending).toBe(209000);
    expect(getTotals(db, "2026-03-01", "2026-03-31", main).spending).toBe(202000);
    expect(getTotals(db, "2026-03-01", "2026-03-31", savings)).toEqual({
      income: 0,
      spending: 7000,
      net: -7000,
      transactionCount: 1,
    });
    expect(getMonthlyTotals(db, "2026-03", "2026-03", savings)).toEqual([
      { month: "2026-03", income: 0, spending: 7000 },
    ]);
    expect(getDailySpending(db, "2026-03", savings)[7]).toBe(7000);
    expect(getDailySpending(db, "2026-03", main)[7]).toBe(0);
    expect(
      getSpendingByCategory(db, "2026-03-01", "2026-03-31", savings).map((c) => [c.name, c.amount]),
    ).toEqual([["Groceries", 7000]]);
    expect(getIncomeByCategory(db, "2026-03-01", "2026-03-31", savings)).toEqual([]);
    expect(
      getTopMerchants(db, "2026-03-01", "2026-03-31", 10, savings).map((m) => [m.merchant, m.amount]),
    ).toEqual([["Coop", 7000]]);
  });
});

describe("accounts", () => {
  it("summarises the account with its latest balance", () => {
    expect(listAccounts(db)).toEqual([
      {
        id: 1,
        name: "LLB account",
        currency: "CHF",
        balance: 663000,
        balanceDate: "2026-03-27",
        transactionCount: 11,
        firstDate: "2026-02-25",
        lastDate: "2026-03-27",
      },
    ]);
    expect(getDataRange(db)).toEqual({
      firstDate: "2026-02-25",
      lastDate: "2026-03-27",
      coveredThrough: "2026-03-27",
      transactionCount: 11,
    });
  });

  it("returns the closing balance of each booking day", () => {
    const series = getBalanceSeries(db, 1);
    expect(series[0]).toEqual({ date: "2026-02-25", balance: 600000 });
    expect(series.at(-1)).toEqual({ date: "2026-03-27", balance: 663000 });
    expect(series).toHaveLength(11);
  });

  it("uses the last booking of a day even if its timestamp is earlier", () => {
    const other = openDb(":memory:");
    ingestExport(other, {
      filename: "day.xlsx",
      data: buildExport([
        { reference: 1, bookedAt: "2026-05-04T12:47:54", text: "E-Banking Kontoübertrag\nAuftragsnummer: 1", amount: -500 },
        { reference: 2, bookedAt: "2026-05-04T11:22:30", text: "E-Banking Kontoübertrag.\nAuftragsnummer: 2", amount: 700 },
      ]),
    });
    expect(getBalanceSeries(other, 1)).toEqual([{ date: "2026-05-04", balance: 120000 }]);
    expect(listAccounts(other)[0].balance).toBe(120000);
  });

  it("finds no gaps in a complete history", () => {
    expect(findBalanceGaps(db)).toEqual([]);
  });

  it("reports bookings that were never imported", () => {
    const other = openDb(":memory:");
    ingestExport(other, { filename: "a.xlsx", data: buildExport(ledger.slice(0, 3)) });
    // the next export starts at booking 207: 204–206 (−470.00 in total) are missing
    ingestExport(other, {
      filename: "b.xlsx",
      data: buildExport(ledger.slice(6), { openingBalance: 3630 }),
    });
    expect(findBalanceGaps(other)).toEqual([
      {
        accountId: 1,
        accountName: "LLB account",
        afterDate: "2026-02-27",
        beforeDate: "2026-03-10",
        missingAmount: -47000,
      },
    ]);
  });

  it("lists imports with what is left of them", () => {
    expect(listImports(db)).toMatchObject([
      { filename: "export.xlsx", rowCount: 11, insertedCount: 11, duplicateCount: 0, remaining: 11 },
    ]);
  });
});

describe("transactions", () => {
  const references = (filter: Parameters<typeof listTransactions>[1]) =>
    listTransactions(db, filter, { limit: 50 }).rows.map((row) => Number(row.reference));

  it("lists newest first by effective date", () => {
    expect(references({})).toEqual([211, 210, 209, 208, 207, 206, 205, 204, 203, 202, 201]);
  });

  it("filters by text, amount, flow, category and date", () => {
    expect(references({ search: "coop" })).toEqual([208, 204, 203]);
    expect(references({ search: "COOP" })).toEqual([208, 204, 203]);
    expect(references({ search: "miete" })).toEqual([210, 202]);
    expect(references({ search: "80.00" })).toEqual([207]);
    expect(references({ search: "100%" })).toEqual([]);
    expect(references({ flow: "income" })).toEqual([209, 201]);
    expect(references({ flow: "transfer" })).toEqual([206]);
    expect(references({ category: "none" })).toEqual([211]);
    expect(references({ category: categoryId("groceries") })).toEqual([208, 205, 204, 203]);
    expect(references({ from: "2026-03-01", to: "2026-03-09" })).toEqual([207, 206, 205]);
    expect(references({ merchantKey: "coop", from: "2026-03-01" })).toEqual([208]);
  });

  it("searches category names as stored, or the categories a caller matched itself", () => {
    const groceries = [208, 205, 204, 203];
    expect(references({ search: "groceries" })).toEqual(groceries);
    // a caller showing "Groceries" as "Lebensmittel" resolves the name and passes the ids
    expect(references({ search: "lebensmittel" })).toEqual([]);
    expect(references({ search: "lebensmittel", searchCategoryIds: [categoryId("groceries")] })).toEqual(groceries);
    // … and then the stored name no longer matches behind its back
    expect(references({ search: "groceries", searchCategoryIds: [] })).toEqual([]);
    // text matches still count alongside
    expect(references({ search: "coop", searchCategoryIds: [categoryId("dining")] })).toEqual([208, 207, 204, 203]);
  });

  it("pages and summarises the whole filtered set", () => {
    const page = listTransactions(db, { from: "2026-03-01" }, { limit: 2, offset: 2 });
    expect(page.rows.map((row) => Number(row.reference))).toEqual([209, 208]);
    expect(page.total).toBe(7);
    expect(page.moneyIn).toBe(503000);
    expect(page.moneyOut).toBe(245000);
  });

  it("restricts to a set of ids", () => {
    expect(references({ ids: [idOf(202), idOf(210)] })).toEqual([210, 202]);
  });

  it("collects merchants that still need a category", () => {
    expect(countUncategorised(db)).toBe(1);
    expect(getUncategorisedMerchants(db)).toMatchObject([
      { merchantKey: "erika beispiel", merchant: "Erika Beispiel", count: 1, total: -15000 },
    ]);
  });
});

describe("categorising", () => {
  it("changes a single booking without creating a rule", () => {
    const change = setTransactionCategory(db, idOf(205), categoryId("dining"), "one");
    expect(change).toEqual({ updated: 1, merchant: "Hofladen Beispiel", merchantTotal: 1 });
    expect(listRules(db)).toEqual([]);
    const row = listTransactions(db, { ids: [idOf(205)] }, { limit: 1 }).rows[0];
    expect(row).toMatchObject({ categoryName: "Dining & Drinks", categorySlug: "dining", categorySource: "manual" });
  });

  it("categorises a whole merchant and remembers it for future imports", () => {
    const gifts = categoryId("gifts");
    const change = setMerchantCategory(db, "erika beispiel", gifts);
    expect(change.updated).toBe(1);
    expect(countUncategorised(db)).toBe(0);
    expect(listRules(db)).toMatchObject([
      { matchType: "merchant", pattern: "erika beispiel", merchant: "Erika Beispiel", categoryName: "Gifts & Donations", categorySlug: "gifts", matchCount: 1 },
    ]);

    const later = ingestExport(db, {
      filename: "april.xlsx",
      data: buildExport(
        [{ reference: 301, bookedAt: "2026-04-02T09:00:00", text: paymentText(["Erika Beispiel", "Seeweg 4", "9495 Triesen", "Liechtenstein"]), amount: -60 }],
        { openingBalance: 6630 },
      ),
    });
    expect(later).toMatchObject({ inserted: 1, uncategorised: 0 });
  });

  it("falls back to the built-in guess when a rule is deleted", () => {
    setMerchantCategory(db, "coop", categoryId("shopping"));
    expect(listTransactions(db, { category: categoryId("shopping") }, { limit: 50 }).total).toBe(3);

    expect(deleteRule(db, listRules(db)[0].id)).toBe(3);
    expect(listTransactions(db, { category: categoryId("groceries") }, { limit: 50 }).total).toBe(4);
  });

  it("keeps manual choices when rules are re-applied", () => {
    setTransactionCategory(db, idOf(205), categoryId("dining"), "one");
    createTextRule(db, "Hofladen", categoryId("gifts"));
    const row = listTransactions(db, { ids: [idOf(205)] }, { limit: 1 }).rows[0];
    expect(row.categoryName).toBe("Dining & Drinks");
  });

  it("applies a text rule to existing bookings", () => {
    const changed = createTextRule(db, "Seeweg 4", categoryId("gifts"));
    expect(changed).toBe(1);
    expect(countUncategorised(db)).toBe(0);
    expect(() => createTextRule(db, "ab", categoryId("gifts"))).toThrow(UserError);
  });

  it("clears the category of a merchant again", () => {
    setMerchantCategory(db, "erika beispiel", categoryId("gifts"));
    setTransactionCategory(db, idOf(211), null, "merchant");
    expect(countUncategorised(db)).toBe(1);
    expect(listRules(db)).toEqual([]);
  });
});

describe("categories", () => {
  it("lists spending, income and transfer categories in that order", () => {
    const kinds = listCategories(db).map((category) => category.kind);
    expect(kinds.indexOf("income")).toBeGreaterThan(kinds.lastIndexOf("expense"));
    expect(kinds.indexOf("transfer")).toBeGreaterThan(kinds.lastIndexOf("income"));
    const groceries = listCategoriesWithUsage(db).find((c) => c.slug === "groceries");
    expect(groceries).toMatchObject({ transactionCount: 4, ruleCount: 0 });
  });

  it("creates, renames and deletes categories", () => {
    const id = createCategory(db, { name: "  Hobbies ", kind: "expense", icon: "Gift" });
    expect(listCategories(db).find((c) => c.id === id)?.name).toBe("Hobbies");
    expect(() => createCategory(db, { name: "hobbies", kind: "expense", icon: "Gift" })).toThrow(
      expect.objectContaining({ key: "error.categoryNameTaken", params: { name: "hobbies" } }),
    );
    expect(() => createCategory(db, { name: " ", kind: "expense", icon: "Gift" })).toThrow(UserError);

    updateCategory(db, id, { name: "Hobbies & Sport", kind: "expense", icon: "Gift" });
    setTransactionCategory(db, idOf(207), id, "one");
    deleteCategory(db, id);
    const row = listTransactions(db, { ids: [idOf(207)] }, { limit: 1 }).rows[0];
    expect(row).toMatchObject({ categoryId: null, categorySource: "none" });
  });

  it("moves a category's bookings between flows when its kind changes", () => {
    const groceries = categoryId("groceries");
    setBudget(db, groceries, 40000);
    updateCategory(db, groceries, { name: "Groceries", kind: "transfer", icon: "ShoppingBasket" });
    // rent 1800 + private payment 150 + restaurant 80 remain
    expect(getTotals(db, "2026-03-01", "2026-03-31").spending).toBe(203000);
    expect(getBudgetOverview(db, "2026-03").budgeted).toEqual([]);
  });
});

describe("budgets", () => {
  it("compares spending with budgets and suggests from past months", () => {
    setBudget(db, categoryId("groceries"), 40000);
    setBudget(db, categoryId("dining"), 5000);
    const overview = getBudgetOverview(db, "2026-03");

    // February only has data from the 25th, so it is no basis for an average
    expect(overview.budgeted.map((l) => [l.name, l.slug, l.budget, l.spent, l.average])).toEqual([
      ["Groceries", "groceries", 40000, -1000, null],
      ["Dining & Drinks", "dining", 5000, 8000, null],
    ]);
    expect(overview.unbudgeted.map((l) => [l.name, l.spent, l.average])).toEqual([
      ["Housing", 180000, null],
    ]);
    expect(overview).toMatchObject({ totalBudget: 45000, spentOnBudgeted: 7000, totalSpent: 202000 });
  });

  it("averages over complete months only", () => {
    const groceries = categoryId("groceries");
    const housing = categoryId("housing");
    // with February fully covered: rent 1800, Coop 100 + 50
    const full = getAverageSpendingByCategory(db, "2026-03", { from: "2026-02-01", to: "2026-03-27" });
    expect(full.get(housing)).toBe(180000);
    expect(full.get(groceries)).toBe(15000);
    // two complete months halve it when the earlier one had no spending
    const two = getAverageSpendingByCategory(db, "2026-03", { from: "2026-01-01", to: "2026-03-27" });
    expect(two.get(housing)).toBe(90000);
    // data starting mid-February leaves no complete month before March
    const none = getAverageSpendingByCategory(db, "2026-03", { from: "2026-02-25", to: "2026-03-27" });
    expect(none.size).toBe(0);
  });

  it("removes a budget and refuses one for income", () => {
    const dining = categoryId("dining");
    setBudget(db, dining, 5000);
    setBudget(db, dining, null);
    expect(getBudgetOverview(db, "2026-03").budgeted).toEqual([]);
    expect(() => setBudget(db, categoryId("salary"), 1000)).toThrow(UserError);
  });
});

describe("recurring", () => {
  it("detects rent and salary and predicts the next dates", () => {
    const { series, dataThrough } = getRecurring(db);
    expect(dataThrough).toBe("2026-03-27");
    expect(series.map((s) => [s.merchant, s.direction, s.cadence, s.amount, s.nextDate])).toEqual([
      ["Beispiel Schweiz AG", "in", "monthly", 500000, "2026-04-25"],
      ["Muster Immobilien AG", "out", "monthly", 180000, "2026-04-26"],
    ]);
    expect(upcomingCharges(series, "2026-03-28", "2026-04-25").map((c) => [c.series.merchant, c.date])).toEqual([
      ["Beispiel Schweiz AG", "2026-04-25"],
    ]);
  });

  it("honours ignore and force decisions", () => {
    ignoreRecurring(db, "muster immobilien ag", "out");
    forceRecurring(db, "erika beispiel", "out", "monthly");
    const { series } = getRecurring(db);
    expect(series.map((s) => [s.merchant, s.evidence])).toEqual([
      ["Beispiel Schweiz AG", "pattern"],
      ["Erika Beispiel", "confirmed"],
    ]);
    expect(listIgnoredRecurring(db)).toEqual([
      { merchantKey: "muster immobilien ag", merchant: "Muster Immobilien AG", direction: "out" },
    ]);
  });
});

describe("deleteEmptyAccount", () => {
  it("refuses to delete an account that still has bookings", () => {
    expect(() => deleteEmptyAccount(db, 1)).toThrow(UserError);
    const empty = db.run("INSERT INTO accounts (name) VALUES ('Savings')").lastInsertRowid;
    deleteEmptyAccount(db, empty);
    expect(listAccounts(db)).toHaveLength(1);
  });
});
