/**
 * Booking order.
 *
 * The export lists bookings in the bank's own order, and each row carries the
 * running balance after it. That order is worth keeping: it is the only way to
 * know the true closing balance of a day, because the timestamps of bookings
 * made on the same day do not follow it.
 *
 * Exports overlap from month to month (and may be imported out of order), so
 * every import is merged into the order that is already stored.
 */

export type FileOrder = "newest-first" | "oldest-first" | "unverified";

interface Chainable {
  amount: number;
  balance: number | null;
}

interface Dated extends Chainable {
  bookedAt: string;
}

/** `true` if `next` directly follows `previous`, `null` if it cannot be told. */
function follows(previous: Chainable, next: Chainable): boolean | null {
  if (previous.balance === null || next.balance === null) return null;
  return previous.balance + next.amount === next.balance;
}

function isChain(rows: readonly Chainable[]): boolean {
  for (let i = 1; i < rows.length; i++) {
    if (follows(rows[i - 1], rows[i]) !== true) return false;
  }
  return true;
}

/**
 * Returns the rows oldest-first. The running balance tells which way the file
 * is sorted; without it the booking timestamp is the best available guide.
 */
export function toChronological<T extends Dated>(rows: readonly T[]): { rows: T[]; order: FileOrder } {
  if (rows.length < 2) return { rows: [...rows], order: "newest-first" };

  const reversed = [...rows].reverse();
  if (isChain(reversed)) return { rows: reversed, order: "newest-first" };
  if (isChain(rows)) return { rows: [...rows], order: "oldest-first" };

  // Sorted by something else, or filtered: fall back to the timestamps, and
  // keep the file's relative order for bookings with identical ones.
  const descending = rows[0].bookedAt >= rows[rows.length - 1].bookedAt;
  const base = descending ? reversed : [...rows];
  const sorted = base
    .map((row, index) => ({ row, index }))
    .sort((a, b) => a.row.bookedAt.localeCompare(b.row.bookedAt) || a.index - b.index)
    .map((entry) => entry.row);
  return { rows: sorted, order: "unverified" };
}

export interface ExistingBooking extends Chainable {
  id: number;
  /** `YYYY-MM-DD` of the booking timestamp. */
  bookedDay: string;
}

export interface IncomingBooking extends Chainable {
  /** Id of the stored booking this row duplicates, or `null` if it is new. */
  existingId: number | null;
  bookedDay: string;
}

export type OrderSlot =
  | { type: "existing"; id: number }
  | { type: "new"; index: number };

/**
 * Merges an import into the stored booking order.
 *
 * @param existing stored bookings of the account, oldest first
 * @param incoming rows of the import, oldest first
 * @returns every booking, old and new, in order; `index` points into `incoming`
 */
export function mergeOrder(
  existing: readonly ExistingBooking[],
  incoming: readonly IncomingBooking[],
): OrderSlot[] {
  const slots: OrderSlot[] = [];
  const positionOf = new Map(existing.map((row, index) => [row.id, index]));
  let cursor = 0; // next stored booking that has not been placed yet
  let last: Chainable | null = null;

  const placeExisting = (until: number) => {
    while (cursor < until) {
      slots.push({ type: "existing", id: existing[cursor].id });
      last = existing[cursor];
      cursor += 1;
    }
  };
  const placeNew = (from: number, until: number) => {
    for (let index = from; index < until; index++) {
      slots.push({ type: "new", index });
      last = incoming[index];
    }
  };

  // For each incoming row: where in `existing` the next duplicate after it sits.
  const nextAnchor: Array<number | null> = new Array(incoming.length).fill(null);
  let upcoming: number | null = null;
  for (let k = incoming.length - 1; k >= 0; k--) {
    nextAnchor[k] = upcoming;
    const id = incoming[k].existingId;
    if (id !== null) upcoming = positionOf.get(id) ?? upcoming;
  }

  let k = 0;
  while (k < incoming.length) {
    const row = incoming[k];

    if (row.existingId !== null) {
      // A duplicate pins the two orders together: everything stored up to and
      // including it comes before whatever follows in the file.
      const position = positionOf.get(row.existingId);
      if (position !== undefined && position >= cursor) placeExisting(position + 1);
      k += 1;
      continue;
    }

    const day = row.bookedDay;
    const anchor = nextAnchor[k];
    const limit = anchor !== null && anchor >= cursor ? anchor : existing.length;
    const anchored = limit < existing.length;

    // Stored bookings of earlier days come first.
    let earlier = cursor;
    while (earlier < limit && existing[earlier].bookedDay < day) earlier += 1;
    placeExisting(earlier);

    // The run of new rows booked on this day …
    let runEnd = k;
    while (
      runEnd < incoming.length &&
      incoming[runEnd].existingId === null &&
      incoming[runEnd].bookedDay === day
    ) {
      runEnd += 1;
    }
    // … and the stored bookings of the same day that are still unplaced.
    let sameDayEnd = cursor;
    while (sameDayEnd < limit && existing[sameDayEnd].bookedDay === day) sameDayEnd += 1;

    if (sameDayEnd > cursor) {
      const stored = existing.slice(cursor, sameDayEnd);
      const fresh = incoming.slice(k, runEnd);
      // With a duplicate still ahead, the file's rows are known to sit right
      // before it. Otherwise let the running balance decide which block is
      // older; when it cannot, assume the import is the newer data.
      const storedFirst = anchored || breaks(last, stored, fresh) <= breaks(last, fresh, stored);
      if (storedFirst) placeExisting(sameDayEnd);
    }
    placeNew(k, runEnd);
    k = runEnd;
  }

  placeExisting(existing.length);
  return slots;
}

/** Number of places where the running balance does not carry over. */
function breaks(
  before: Chainable | null,
  first: readonly Chainable[],
  second: readonly Chainable[],
): number {
  let count = 0;
  if (before && follows(before, first[0]) === false) count += 1;
  if (follows(first[first.length - 1], second[0]) === false) count += 1;
  return count;
}
