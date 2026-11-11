import { describe, expect, it } from "vitest";

import {
  advance,
  detectRecurring,
  nextOccurrence,
  periodCadence,
  type RecurringInput,
  type RecurringOverride,
} from "./detect";

let nextId = 1;

function tx(
  merchantKey: string,
  date: string,
  amount: number,
  extra: Partial<RecurringInput> = {},
): RecurringInput {
  return {
    id: nextId++,
    date,
    amount: Math.round(amount * 100),
    merchant: merchantKey,
    merchantKey,
    kind: "payment",
    rawText: "",
    categoryId: null,
    categoryName: null,
    categoryIcon: null,
    ...extra,
  };
}

const detect = (
  rows: RecurringInput[],
  dataThrough: string,
  overrides: RecurringOverride[] = [],
) => detectRecurring(rows, overrides, dataThrough);

describe("periodCadence", () => {
  it("reads the billing period printed in a booking text", () => {
    expect(periodCadence("Abrechnungszeitraum: 01.11.2026 - 30.11.2026")).toBe("monthly");
    expect(periodCadence("Gebühren\nPeriode 01.07.2026-30.09.2026")).toBe("quarterly");
    expect(periodCadence("Periode 30.06.2026-30.09.2026")).toBe("quarterly");
    expect(periodCadence("Beitrag 01.01.2026 - 31.12.2026")).toBe("yearly");
    expect(periodCadence("Rechnung vom 26.09.2026")).toBeNull();
    expect(periodCadence("Aufenthalt 03.08.2026 - 14.08.2026")).toBeNull();
  });
});

describe("advance", () => {
  it("steps by cadence and clamps to the end of the month", () => {
    expect(advance("2026-01-31", "monthly")).toBe("2026-02-28");
    expect(advance("2026-11-30", "quarterly")).toBe("2027-02-28");
    expect(advance("2026-03-10", "weekly", 2)).toBe("2026-03-24");
    expect(advance("2026-03-10", "yearly")).toBe("2027-03-10");
  });
});

describe("detectRecurring", () => {
  it("finds a fixed monthly payment from two occurrences", () => {
    const [rent, ...rest] = detect(
      [tx("landlord", "2026-09-30", -2200), tx("landlord", "2026-10-30", -2200)],
      "2026-11-11",
    );
    expect(rest).toEqual([]);
    expect(rent).toMatchObject({
      merchantKey: "landlord",
      direction: "out",
      cadence: "monthly",
      amount: 220000,
      variable: false,
      monthlyAmount: 220000,
      lastDate: "2026-10-30",
      nextDate: "2026-11-30",
      active: true,
      evidence: "pattern",
    });
    expect(rent.occurrences.map((o) => o.date)).toEqual(["2026-09-30", "2026-10-30"]);
  });

  it("separates two policies billed by the same insurer", () => {
    const series = detect(
      [
        tx("insurer", "2026-10-06", -538.3),
        tx("insurer", "2026-10-06", -666.9),
        tx("insurer", "2026-10-06", -197.8), // a one-off bill
        tx("insurer", "2026-10-30", -538.3),
        tx("insurer", "2026-10-30", -666.9),
      ],
      "2026-11-11",
    );
    expect(series.map((s) => [s.amount, s.cadence, s.occurrences.length])).toEqual([
      [66690, "monthly", 2],
      [53830, "monthly", 2],
    ]);
  });

  it("ignores places where the card is used all the time", () => {
    const visits = ["01", "03", "06", "08", "10", "13", "15", "17", "20", "22", "24", "27", "29"].map(
      (day) => tx("bakery", `2026-10-${day}`, -5.2, { kind: "card" }),
    );
    expect(detect(visits, "2026-10-31")).toEqual([]);
  });

  it("needs three regular charges before trusting an unknown card merchant", () => {
    const two = [
      tx("gym", "2026-08-05", -49, { kind: "card" }),
      tx("gym", "2026-09-05", -49, { kind: "card" }),
    ];
    expect(detect(two, "2026-09-20")).toEqual([]);

    const three = [...two, tx("gym", "2026-10-05", -49, { kind: "card" })];
    expect(detect(three, "2026-10-20")).toMatchObject([
      { merchantKey: "gym", cadence: "monthly", amount: 4900, evidence: "pattern" },
    ]);
  });

  it("recognises a known subscription from a single charge", () => {
    const [netflix] = detect([tx("netflix", "2026-10-26", -15.1, { kind: "card" })], "2026-11-11");
    expect(netflix).toMatchObject({
      cadence: "monthly",
      amount: 1510,
      evidence: "known",
      nextDate: "2026-11-26",
      active: true,
    });
  });

  it("does not treat money received from a known biller as recurring", () => {
    // a health insurer paying out a claim once
    expect(detect([tx("concordia", "2026-10-29", 154.4, { kind: "credit" })], "2026-11-11")).toEqual([]);
  });

  it("averages a known biller whose invoices vary", () => {
    const [salt] = detect(
      [
        tx("salt", "2026-10-06", -82.3),
        tx("salt", "2026-10-06", -1.45),
        tx("salt", "2026-10-28", -66.95),
        tx("salt", "2026-10-28", -34.95),
        tx("salt", "2026-11-10", -45.15),
      ],
      "2026-11-11",
    );
    expect(salt).toMatchObject({
      key: "out:salt",
      cadence: "monthly",
      variable: true,
      amount: 4515,
      monthlyAmount: 11540, // 230.80 over October and November
      evidence: "known",
    });
  });

  it("takes the cadence from a billing period in the text", () => {
    const series = detect(
      [
        tx("fee card", "2026-09-30", -12, { kind: "fee", rawText: "Gebühren\nGebühr Debitkarte\nPeriode 01.07.2026-30.09.2026" }),
        tx("child allowance", "2026-10-15", 620, { kind: "credit", rawText: "Gutschrift\nFamilienzulagen;Periode 01.10.2026 - 31.10.2026;" }),
      ],
      "2026-11-11",
    );
    expect(series.map((s) => [s.merchantKey, s.direction, s.cadence, s.evidence, s.monthlyAmount])).toEqual([
      ["child allowance", "in", "monthly", "period", 62000],
      ["fee card", "out", "quarterly", "period", 400],
    ]);
  });

  it("spots salary and rent by keyword", () => {
    const series = detect(
      [
        tx("employer", "2026-10-23", 7471.5, { kind: "credit", rawText: "Gutschrift\nBEISPIEL AG\nSalarzahlung" }),
        tx("landlord", "2026-10-30", -1800, { rawText: "E-Banking Zahlung\nMax Muster\nMiete Beispielweg 3" }),
        tx("friend", "2026-10-12", -40, { rawText: "E-Banking Zahlung\nErika Beispiel\nDanke fürs Auslegen" }),
      ],
      "2026-11-11",
    );
    expect(series.map((s) => [s.merchantKey, s.direction, s.evidence])).toEqual([
      ["employer", "in", "keyword"],
      ["landlord", "out", "keyword"],
    ]);
  });

  it("recognises a bill paid every month even though the amount varies", () => {
    const rows = [
      tx("utility", "2026-07-12", -81.2),
      tx("utility", "2026-08-09", -64.5),
      tx("utility", "2026-09-14", -102.75),
    ];
    expect(detect(rows.slice(0, 2), "2026-08-20")).toEqual([]);
    expect(detect(rows, "2026-09-20")).toMatchObject([
      { key: "out:utility", cadence: "monthly", variable: true, evidence: "pattern" },
    ]);
  });

  it("follows a series through a price change", () => {
    const [series] = detect(
      [
        tx("streaming", "2026-07-03", -15.99),
        tx("streaming", "2026-08-03", -15.99),
        tx("streaming", "2026-09-03", -17.99),
      ],
      "2026-09-20",
    );
    expect(series.occurrences).toHaveLength(3);
    expect(series).toMatchObject({ amount: 1799, variable: false, nextDate: "2026-10-03", active: true });
  });

  it("tolerates one skipped charge in a long series", () => {
    const dates = ["2026-01-05", "2026-02-05", "2026-03-05", "2026-05-05", "2026-06-05"];
    const [series] = detect(dates.map((date) => tx("magazine", date, -9.9)), "2026-06-10");
    expect(series).toMatchObject({ cadence: "monthly", active: true });
    expect(series.occurrences).toHaveLength(5);
  });

  it("marks a series inactive when the next charge is long overdue", () => {
    const rows = [tx("old gym", "2026-03-01", -60), tx("old gym", "2026-04-01", -60)];
    expect(detect(rows, "2026-05-10")[0].active).toBe(true); // due 1 May, 9 days late
    expect(detect(rows, "2026-07-01")[0].active).toBe(false);
  });

  it("detects quarterly and yearly rhythms", () => {
    const quarterly = detect(
      [tx("water", "2026-01-15", -120), tx("water", "2026-04-14", -120), tx("water", "2026-07-16", -120)],
      "2026-07-20",
    );
    expect(quarterly[0]).toMatchObject({ cadence: "quarterly", monthlyAmount: 4000 });

    const yearly = detect([tx("club", "2025-02-01", -240), tx("club", "2026-02-03", -240)], "2026-03-01");
    expect(yearly[0]).toMatchObject({ cadence: "yearly", monthlyAmount: 2000, nextDate: "2027-02-03" });
  });

  it("obeys the user's decisions", () => {
    const rent = [tx("landlord", "2026-09-30", -2200), tx("landlord", "2026-10-30", -2200)];
    expect(
      detect(rent, "2026-11-11", [
        { merchantKey: "landlord", direction: "out", decision: "ignore", cadence: null },
      ]),
    ).toEqual([]);

    const oneOff = [tx("dentist", "2026-10-02", -310)];
    expect(detect(oneOff, "2026-11-11")).toEqual([]);
    expect(
      detect(oneOff, "2026-11-11", [
        { merchantKey: "dentist", direction: "out", decision: "force", cadence: "yearly" },
      ]),
    ).toMatchObject([{ cadence: "yearly", evidence: "confirmed", monthlyAmount: 2583 }]);
  });

  it("keeps money in and money out apart for the same merchant", () => {
    const series = detect(
      [
        tx("insurer", "2026-09-06", -500),
        tx("insurer", "2026-10-06", -500),
        tx("insurer", "2026-10-20", 500, { kind: "credit" }),
      ],
      "2026-10-25",
    );
    expect(series.map((s) => s.direction)).toEqual(["out"]);
  });
});

describe("nextOccurrence", () => {
  it("rolls an expected date forward to the present", () => {
    const [series] = detect([tx("landlord", "2026-08-30", -2200), tx("landlord", "2026-09-30", -2200)], "2026-10-02");
    expect(series.nextDate).toBe("2026-10-30");
    expect(nextOccurrence(series, "2026-10-15")).toBe("2026-10-30");
    expect(nextOccurrence(series, "2026-12-05")).toBe("2026-12-30");
  });
});
