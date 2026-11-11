import { describe, expect, it } from "vitest";

import {
  addDays,
  addMonths,
  addMonthsToDate,
  daysInMonth,
  diffDays,
  formatDate,
  formatDayHeading,
  formatDayMonth,
  formatMonth,
  formatMonthShort,
  formatRelativeDay,
  isIsoDate,
  isIsoMonth,
  monthEnd,
  monthRange,
} from "./dates";
import { formatAmount, formatAxisValue, formatMoney, parseMoneyInput, splitAmount, toCents } from "./money";
import { resolveMonth } from "./period";

describe("money", () => {
  it("converts spreadsheet amounts to minor units without float drift", () => {
    expect(toCents(-11.6)).toBe(-1160);
    expect(toCents(864.37)).toBe(86437);
    expect(toCents(0.1 + 0.2)).toBe(30);
  });

  it("formats the Swiss way, identically on every runtime", () => {
    expect(formatAmount(123456)).toBe("1’234.56");
    expect(formatAmount(-1160)).toBe("−11.60");
    expect(formatAmount(5)).toBe("0.05");
    expect(formatAmount(62000, { sign: "always" })).toBe("+620.00");
    expect(formatAmount(0, { sign: "always" })).toBe("0.00");
    expect(formatAmount(123456789, { whole: true })).toBe("1’234’568");
    expect(formatMoney(86437)).toBe("CHF 864.37");
    expect(formatMoney(-5500, "EUR")).toBe("−EUR 55.00");
    expect(formatMoney(747150, "CHF", { sign: "always", whole: true })).toBe("+CHF 7’472");
  });

  it("splits a figure into whole and fraction", () => {
    expect(splitAmount(-171356)).toEqual({ sign: "−", whole: "1’713", fraction: "56" });
    expect(splitAmount(7)).toEqual({ sign: "", whole: "0", fraction: "07" });
  });

  it("labels axes in full below ten thousand and compactly above", () => {
    expect(formatAxisValue(2500, 5000)).toBe("2’500");
    expect(formatAxisValue(0, 12500)).toBe("0");
    expect(formatAxisValue(7500, 12500)).toBe("7.5K");
    expect(formatAxisValue(-2500, 10000)).toBe("−2.5K");
    expect(formatAxisValue(1500000, 2000000)).toBe("1.5M");
  });

  it("parses amounts the way people type them", () => {
    expect(parseMoneyInput("1200")).toBe(120000);
    expect(parseMoneyInput("1'200.50")).toBe(120050);
    expect(parseMoneyInput("1’200")).toBe(120000);
    expect(parseMoneyInput("CHF 45.15")).toBe(4515);
    expect(parseMoneyInput("1.200,50")).toBe(120050);
    expect(parseMoneyInput("12,5")).toBe(1250);
    expect(parseMoneyInput("")).toBeNull();
    expect(parseMoneyInput("abc")).toBeNull();
    expect(parseMoneyInput("12.3.4")).toBeNull();
  });
});

describe("dates", () => {
  it("validates ISO dates and months", () => {
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("26-02-28")).toBe(false);
    expect(isIsoMonth("2026-11")).toBe(true);
    expect(isIsoMonth("2026-13")).toBe(false);
  });

  it("does calendar arithmetic without time zones", () => {
    expect(addDays("2026-10-25", 1)).toBe("2026-10-26"); // across the end of DST
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(diffDays("2026-10-06", "2026-10-30")).toBe(24);
    expect(diffDays("2026-03-28", "2026-03-30")).toBe(2); // across the start of DST
    expect(addMonths("2026-11", 2)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonthsToDate("2026-01-31", 1)).toBe("2026-02-28");
    expect(daysInMonth("2028-02")).toBe(29);
    expect(monthEnd("2026-09")).toBe("2026-09-30");
    expect(monthRange("2026-11", "2027-02")).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
  });

  it("formats with fixed English names", () => {
    expect(formatDate("2026-09-29")).toBe("29 Sep 2026");
    expect(formatDayMonth("2026-11-01")).toBe("1 Nov");
    expect(formatDayHeading("2026-11-10")).toBe("Tue 10 Nov");
    expect(formatDayHeading("2025-12-31", "2026")).toBe("Wed 31 Dec 2025");
    expect(formatMonth("2026-11")).toBe("November 2026");
    expect(formatMonthShort("2026-01", true)).toBe("Jan 26");
  });

  it("describes days relative to today", () => {
    expect(formatRelativeDay("2026-11-11", "2026-11-11")).toBe("today");
    expect(formatRelativeDay("2026-11-12", "2026-11-11")).toBe("tomorrow");
    expect(formatRelativeDay("2026-11-15", "2026-11-11")).toBe("in 4 days");
    expect(formatRelativeDay("2026-11-08", "2026-11-11")).toBe("3 days ago");
  });
});

describe("resolveMonth", () => {
  const bounds = { min: "2026-09", max: "2026-11" };
  it("uses the requested month when it has data, the latest otherwise", () => {
    expect(resolveMonth("2026-10", bounds)).toBe("2026-10");
    expect(resolveMonth(undefined, bounds)).toBe("2026-11");
    expect(resolveMonth("2026-12", bounds)).toBe("2026-11");
    expect(resolveMonth("2025-01", bounds)).toBe("2026-11");
    expect(resolveMonth("nonsense", bounds)).toBe("2026-11");
  });
});
