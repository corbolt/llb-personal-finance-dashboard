import { describe, expect, it } from "vitest";

import { fromTop, niceScale } from "./scale";

describe("niceScale", () => {
  it("rounds the top of the axis up to a clean number", () => {
    expect(niceScale(0, 10895)).toEqual({ min: 0, max: 12500, ticks: [0, 2500, 5000, 7500, 10000, 12500] });
    expect(niceScale(0, 4683)).toEqual({ min: 0, max: 5000, ticks: [0, 1000, 2000, 3000, 4000, 5000] });
    expect(niceScale(0, 87)).toEqual({ min: 0, max: 100, ticks: [0, 20, 40, 60, 80, 100] });
  });

  it("extends below zero for negative values", () => {
    expect(niceScale(-1608, 8789)).toEqual({
      min: -2500,
      max: 10000,
      ticks: [-2500, 0, 2500, 5000, 7500, 10000],
    });
  });

  it("always includes zero", () => {
    expect(niceScale(4000, 9000).min).toBe(0);
    expect(niceScale(-900, -100).max).toBe(0);
  });

  it("copes with an empty or flat series", () => {
    expect(niceScale(0, 0)).toEqual({ min: 0, max: 1, ticks: [0, 1] });
    expect(niceScale(0, 0.4).ticks).toEqual([0, 0.1, 0.2, 0.3, 0.4]);
  });
});

describe("fromTop", () => {
  it("maps values to percentages from the top", () => {
    const scale = niceScale(0, 100);
    expect(fromTop(scale, 100)).toBe(0);
    expect(fromTop(scale, 0)).toBe(100);
    expect(fromTop(scale, 25)).toBe(75);
  });
});
