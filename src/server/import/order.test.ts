import { describe, expect, it } from "vitest";

import {
  mergeOrder,
  toChronological,
  type ExistingBooking,
  type IncomingBooking,
  type OrderSlot,
} from "./order";

interface Booking {
  id: string;
  bookedAt: string;
  amount: number;
  balance: number | null;
}

/** Builds a ledger with running balances from `[id, day, amount]` tuples. */
function ledger(entries: Array<[id: string, day: string, amount: number]>, opening = 1000): Booking[] {
  let balance = opening;
  return entries.map(([id, day, amount], index) => {
    balance += amount;
    const hour = String(8 + index).padStart(2, "0");
    return { id, bookedAt: `${day}T${hour}:00:00`, amount, balance };
  });
}

const ids = (rows: Booking[]) => rows.map((row) => row.id);

describe("toChronological", () => {
  const truth = ledger([
    ["a", "2026-03-01", -10],
    ["b", "2026-03-01", -20],
    ["c", "2026-03-02", 500],
    ["d", "2026-03-03", -5],
  ]);

  it("reverses the bank's newest-first order", () => {
    const result = toChronological([...truth].reverse());
    expect(result.order).toBe("newest-first");
    expect(ids(result.rows)).toEqual(["a", "b", "c", "d"]);
  });

  it("keeps a file that is already oldest-first", () => {
    const result = toChronological(truth);
    expect(result.order).toBe("oldest-first");
    expect(ids(result.rows)).toEqual(["a", "b", "c", "d"]);
  });

  it("trusts the running balance over the timestamps", () => {
    // booked on the same day, but the later timestamp was posted first
    const rows: Booking[] = [
      { id: "first", bookedAt: "2026-03-01T12:47:54", amount: -30, balance: 970 },
      { id: "second", bookedAt: "2026-03-01T11:22:30", amount: 30, balance: 1000 },
    ];
    const result = toChronological([...rows].reverse());
    expect(result.order).toBe("newest-first");
    expect(ids(result.rows)).toEqual(["first", "second"]);
  });

  it("falls back to timestamps when the balances do not chain", () => {
    const shuffled = [truth[2], truth[0], truth[3], truth[1]];
    const result = toChronological(shuffled);
    expect(result.order).toBe("unverified");
    expect(ids(result.rows)).toEqual(["a", "b", "c", "d"]);
  });

  it("falls back to timestamps when there are no balances", () => {
    const rows = [...truth].reverse().map((row) => ({ ...row, balance: null }));
    const result = toChronological(rows);
    expect(result.order).toBe("unverified");
    expect(ids(result.rows)).toEqual(["a", "b", "c", "d"]);
  });
});

describe("mergeOrder", () => {
  /**
   * Simulates importing `files` one after another. Each file is a slice of the
   * true ledger; the result is the stored order by booking id.
   */
  function importAll(truth: Booking[], files: Booking[][]): string[] {
    let stored: Array<ExistingBooking & { key: string }> = [];
    let nextId = 1;
    for (const file of files) {
      const incoming: Array<IncomingBooking & { key: string }> = file.map((row) => ({
        key: row.id,
        existingId: stored.find((s) => s.key === row.id)?.id ?? null,
        bookedDay: row.bookedAt.slice(0, 10),
        amount: row.amount,
        balance: row.balance,
      }));
      const slots: OrderSlot[] = mergeOrder(stored, incoming);
      stored = slots.map((slot) => {
        if (slot.type === "existing") return stored.find((s) => s.id === slot.id)!;
        const row = incoming[slot.index];
        return { id: nextId++, key: row.key, bookedDay: row.bookedDay, amount: row.amount, balance: row.balance };
      });
    }
    expect(new Set(stored.map((s) => s.key)).size).toBe(stored.length);
    void truth;
    return stored.map((s) => s.key);
  }

  const truth = ledger([
    ["a", "2026-03-01", -10],
    ["b", "2026-03-01", -20],
    ["c", "2026-03-02", 500],
    ["d", "2026-03-02", -5],
    ["e", "2026-03-02", -7],
    ["f", "2026-03-03", -1],
    ["g", "2026-03-04", -2],
  ]);
  const all = ids(truth);
  const slice = (from: string, to: string) => truth.slice(all.indexOf(from), all.indexOf(to) + 1);

  it("stores a first import in order", () => {
    expect(importAll(truth, [truth])).toEqual(all);
  });

  it("changes nothing when the same file is imported again", () => {
    expect(importAll(truth, [truth, truth])).toEqual(all);
  });

  it("appends a newer export that overlaps the stored data", () => {
    expect(importAll(truth, [slice("a", "d"), slice("c", "g")])).toEqual(all);
  });

  it("appends a newer export that starts mid-day without overlap", () => {
    expect(importAll(truth, [slice("a", "d"), slice("e", "g")])).toEqual(all);
  });

  it("prepends an older export that overlaps the stored data", () => {
    expect(importAll(truth, [slice("d", "g"), slice("a", "e")])).toEqual(all);
  });

  it("prepends an older export that ends mid-day without overlap", () => {
    expect(importAll(truth, [slice("e", "g"), slice("a", "d")])).toEqual(all);
  });

  it("fills a gap between two stored ranges", () => {
    expect(importAll(truth, [slice("a", "b"), slice("f", "g"), slice("b", "f")])).toEqual(all);
  });

  it("places an export around a same-day pair that nets to zero", () => {
    // d and e cancel out, so the balance before d equals the balance after e
    const zeroSum = ledger([
      ["a", "2026-03-01", -10],
      ["d", "2026-03-02", 250],
      ["e", "2026-03-02", -250],
      ["f", "2026-03-02", -3],
      ["g", "2026-03-03", -4],
    ]);
    const order = ids(zeroSum);
    expect(importAll(zeroSum, [zeroSum.slice(0, 3), zeroSum.slice(3)])).toEqual(order);
    expect(importAll(zeroSum, [zeroSum.slice(3), zeroSum.slice(0, 3)])).toEqual(order);
  });

  it("assumes an import is newer when balances are not exported", () => {
    const bare = truth.map((row) => ({ ...row, balance: null }));
    const first = bare.slice(0, 4); // a..d
    const second = bare.slice(4); // e..g, e shares its day with c and d
    expect(importAll(bare, [first, second])).toEqual(all);
  });
});
