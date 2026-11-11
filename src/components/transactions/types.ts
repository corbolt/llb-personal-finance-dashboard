import type { Cadence } from "@/server/import/merchants";
import type { TransactionRow } from "@/server/queries/transactions";

/** A booking as the list shows it: the stored row plus what detection found. */
export interface TransactionItem extends TransactionRow {
  /** Set when the booking belongs to a recurring series. */
  recurringCadence: Cadence | null;
  /** The user's own decision for this merchant, if any. */
  recurringDecision: "ignore" | "force" | null;
}
