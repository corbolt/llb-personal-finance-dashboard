import type { Db } from "../db/database";

/**
 * Pairs the two sides of transfers between own accounts.
 *
 * The bank books both sides of a transfer one after the other, the paying
 * side first, so the receiving side carries the next reference number
 * (860263735 out → 860263736 in). The
 * booking texts only name the other account, which says nothing about the
 * individual transfer.
 *
 * A pair is two bookings on different accounts, with the same amount and
 * opposite signs, booked at most `MAX_DAYS_APART` days apart. It is taken
 *   1. when the receiving side's reference is the paying side's plus one, or
 *   2. without consecutive references, when both bookings are on the same
 *      day and neither has any other candidate.
 * Either way, a booking with more than one candidate of the same strength
 * stays unpaired: a wrong pair would hide real spending or income.
 *
 * Bookings the user took apart (`transfer_unpaired`) are never paired again.
 * Running it again changes nothing that is already paired.
 *
 * @returns the number of new pairs
 */
export function pairTransfers(db: Db): number {
  const candidates = findCandidates(db);

  const paired = new Set<number>();
  let count = 0;
  const take = (pairs: Candidate[]) => {
    for (const pair of pairs) {
      db.run("UPDATE transactions SET transfer_id = ? WHERE id = ?", [pair.inId, pair.outId]);
      db.run("UPDATE transactions SET transfer_id = ? WHERE id = ?", [pair.outId, pair.inId]);
      paired.add(pair.outId);
      paired.add(pair.inId);
      count += 1;
    }
  };

  // 1. consecutive reference numbers
  take(unique(candidates.filter(isConsecutive)));

  // 2. the only candidate on both sides, booked the same day
  const open = candidates.filter((pair) => !paired.has(pair.outId) && !paired.has(pair.inId));
  take(unique(open).filter((pair) => pair.daysApart === 0));

  return count;
}

const MAX_DAYS_APART = 3;

interface Candidate {
  outId: number;
  inId: number;
  outReference: string | null;
  inReference: string | null;
  daysApart: number;
}

function findCandidates(db: Db): Candidate[] {
  return db.all<Candidate>(
    `SELECT
       o.id AS outId, i.id AS inId,
       o.reference AS outReference, i.reference AS inReference,
       CAST(ABS(julianday(substr(o.booked_at, 1, 10)) - julianday(substr(i.booked_at, 1, 10))) AS INTEGER)
         AS daysApart
     FROM transactions o
     JOIN transactions i
       ON i.amount = -o.amount AND i.account_id != o.account_id AND i.currency = o.currency
     WHERE o.amount < 0
       AND o.transfer_id IS NULL AND i.transfer_id IS NULL
       AND o.transfer_unpaired = 0 AND i.transfer_unpaired = 0
       AND ABS(julianday(substr(o.booked_at, 1, 10)) - julianday(substr(i.booked_at, 1, 10))) <= ?
     ORDER BY o.id, i.id`,
    [MAX_DAYS_APART],
  );
}

function isConsecutive(pair: Candidate): boolean {
  const out = asNumber(pair.outReference);
  const into = asNumber(pair.inReference);
  return out !== null && into !== null && into - out === BigInt(1);
}

/** Reference numbers can be longer than a JavaScript number keeps exactly. */
function asNumber(reference: string | null): bigint | null {
  return reference !== null && /^\d{1,30}$/.test(reference) ? BigInt(reference) : null;
}

/** The candidates whose two bookings appear in no other candidate of the list. */
function unique(pairs: Candidate[]): Candidate[] {
  const uses = new Map<number, number>();
  for (const pair of pairs) {
    uses.set(pair.outId, (uses.get(pair.outId) ?? 0) + 1);
    uses.set(pair.inId, (uses.get(pair.inId) ?? 0) + 1);
  }
  return pairs.filter((pair) => uses.get(pair.outId) === 1 && uses.get(pair.inId) === 1);
}

/**
 * Takes a pair apart for good: both bookings count by their category again
 * and are never paired automatically.
 */
export function unpairTransfer(db: Db, transactionId: number): void {
  db.transaction(() => {
    const row = db.get<{ partner: number | null }>(
      "SELECT transfer_id AS partner FROM transactions WHERE id = ?",
      [transactionId],
    );
    const ids = [transactionId, ...(row?.partner ? [row.partner] : [])];
    for (const id of ids) {
      db.run("UPDATE transactions SET transfer_id = NULL, transfer_unpaired = 1 WHERE id = ?", [id]);
    }
  });
}
