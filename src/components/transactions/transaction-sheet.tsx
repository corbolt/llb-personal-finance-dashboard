"use client";

import { Dialog } from "@base-ui/react/dialog";
import { Repeat, X } from "lucide-react";
import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";

import { ignoreRecurring, markRecurring, resetRecurring, setExcluded, setNote } from "@/app/actions";
import { CategorySelect, type CategoryOption } from "@/components/category-select";
import { Button } from "@/components/ui/button";
import { NativeSelect, Textarea } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/dates";
import { formatAmount, formatMoney } from "@/lib/money";
import type { Cadence } from "@/server/import/merchants";

import type { TransactionItem } from "./types";

const CADENCE_OPTIONS: Array<{ value: Cadence; label: string }> = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Every 2 weeks" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "semiannual", label: "Every 6 months" },
  { value: "yearly", label: "Yearly" },
];

const cadenceLabel = (cadence: Cadence) =>
  CADENCE_OPTIONS.find((option) => option.value === cadence)?.label.toLowerCase() ?? cadence;

/** Side panel with everything known about one booking, and the ways to change it. */
export function TransactionSheet({
  row,
  open,
  onOpenChange,
  categories,
  accountName,
  onCategoryChange,
}: {
  row: TransactionItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: CategoryOption[];
  accountName?: string;
  onCategoryChange: (row: TransactionItem, categoryId: number | null, scope: "one" | "merchant") => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/25 transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0 dark:bg-black/50" />
        <Dialog.Popup className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[27rem] flex-col border-l border-line bg-surface shadow-popover outline-none transition-transform duration-200 ease-out data-ending-style:translate-x-full data-starting-style:translate-x-full">
          {row ? (
            // keyed so the note draft and scope reset when another booking is opened
            <SheetBody
              key={row.id}
              row={row}
              categories={categories}
              accountName={accountName}
              onCategoryChange={onCategoryChange}
            />
          ) : null}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function SheetBody({
  row,
  categories,
  accountName,
  onCategoryChange,
}: {
  row: TransactionItem;
  categories: CategoryOption[];
  accountName?: string;
  onCategoryChange: (row: TransactionItem, categoryId: number | null, scope: "one" | "merchant") => void;
}) {
  const [scope, setScope] = useState<"one" | "merchant">("one");
  const [note, setNoteDraft] = useState(row.note ?? "");
  const [cadence, setCadence] = useState<Cadence>("monthly");
  const [pending, startTransition] = useTransition();

  const direction = row.amount < 0 ? "out" : "in";
  const noteChanged = note.trim() !== (row.note ?? "");

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>, done: string) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) toast.success(done);
      else toast.error(result.error);
    });
  }

  return (
    <>
      <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <Dialog.Title className="truncate text-base font-semibold text-ink">{row.merchant}</Dialog.Title>
          <Dialog.Description className="mt-0.5 text-[13px] text-ink-2">
            {formatDate(row.date)}
            {row.location ? ` · ${row.location}` : ""}
          </Dialog.Description>
        </div>
        <Dialog.Close
          aria-label="Close"
          className="grid size-8 shrink-0 place-items-center rounded-lg text-ink-2 transition-colors hover:bg-wash hover:text-ink"
        >
          <X aria-hidden className="size-4" />
        </Dialog.Close>
      </header>

      <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
        <div>
          <p
            className={cn(
              "text-3xl font-semibold tracking-tight",
              row.amount > 0 ? "text-positive" : "text-ink",
            )}
          >
            <span className="mr-1.5 text-base font-medium text-ink-3">{row.currency}</span>
            {formatAmount(row.amount, { sign: "always" })}
          </p>
          {row.originalAmount !== null && row.originalCurrency ? (
            <p className="mt-1 text-[13px] text-ink-2">
              {formatMoney(Math.abs(row.originalAmount), row.originalCurrency)} at{" "}
              {(Math.abs(row.amount) / Math.abs(row.originalAmount)).toFixed(4)} {row.currency}/
              {row.originalCurrency}
            </p>
          ) : null}
        </div>

        <Section title="Category">
          <CategorySelect
            categories={categories}
            value={row.categoryId}
            onChange={(categoryId) => onCategoryChange(row, categoryId, scope)}
            label="Category"
          />
          <fieldset className="mt-3 space-y-1.5 text-[13px] text-ink-2">
            <legend className="sr-only">Apply the category to</legend>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="scope"
                checked={scope === "one"}
                onChange={() => setScope("one")}
                className="accent-(--accent)"
              />
              Only this transaction
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="scope"
                checked={scope === "merchant"}
                onChange={() => setScope("merchant")}
                className="accent-(--accent)"
              />
              <span>
                Everything from <span className="text-ink">{row.merchant}</span>, including future imports
              </span>
            </label>
          </fieldset>
          {row.categorySource === "auto" ? (
            <p className="mt-2 text-xs text-ink-3">Categorised automatically.</p>
          ) : row.categorySource === "rule" ? (
            <p className="mt-2 text-xs text-ink-3">Categorised by one of your rules.</p>
          ) : null}
        </Section>

        <Section title="Recurring">
          {row.recurringDecision === "ignore" ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-[13px] text-ink-2">You marked this merchant as not recurring.</p>
              <Button
                size="sm"
                disabled={pending}
                onClick={() => run(() => resetRecurring(row.merchantKey, direction), "Recurring detection restored")}
              >
                Undo
              </Button>
            </div>
          ) : row.recurringCadence ? (
            <div className="flex items-center justify-between gap-3">
              <p className="flex items-center gap-2 text-[13px] text-ink-2">
                <Repeat aria-hidden className="size-3.5" />
                Repeats {cadenceLabel(row.recurringCadence)}
              </p>
              <Button
                size="sm"
                disabled={pending}
                onClick={() => run(() => ignoreRecurring(row.merchantKey, direction), "Marked as not recurring")}
              >
                Not recurring
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <NativeSelect
                aria-label="How often it repeats"
                value={cadence}
                onChange={(event) => setCadence(event.target.value as Cadence)}
                className="h-8 flex-1 text-[13px]"
              >
                {CADENCE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </NativeSelect>
              <Button
                size="sm"
                disabled={pending}
                onClick={() =>
                  run(() => markRecurring(row.merchantKey, direction, cadence), `${row.merchant} marked as recurring`)
                }
              >
                Mark as recurring
              </Button>
            </div>
          )}
        </Section>

        <Section title="Note">
          <Textarea
            value={note}
            onChange={(event) => setNoteDraft(event.target.value)}
            rows={2}
            maxLength={500}
            placeholder="Add a note…"
            className="w-full resize-none"
          />
          {noteChanged ? (
            <div className="mt-2 flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setNoteDraft(row.note ?? "")}>
                Discard
              </Button>
              <Button
                size="sm"
                variant="primary"
                disabled={pending}
                onClick={() => run(() => setNote(row.id, note), "Note saved")}
              >
                Save note
              </Button>
            </div>
          ) : null}
        </Section>

        <Section title="Counting">
          <label className="flex items-start gap-2.5 text-[13px] text-ink-2">
            <input
              type="checkbox"
              checked={row.excluded === 1}
              disabled={pending}
              onChange={(event) =>
                run(
                  () => setExcluded(row.id, event.target.checked),
                  event.target.checked ? "Excluded from totals" : "Included in totals again",
                )
              }
              className="mt-0.5 accent-(--accent)"
            />
            <span>
              Leave this transaction out of spending, income and budgets
              {row.flow === "transfer" ? (
                <span className="block text-xs text-ink-3">
                  Transfers between your own accounts never count.
                </span>
              ) : null}
            </span>
          </label>
        </Section>

        <Section title="Details">
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[13px]">
            <Detail label="Booked">
              {formatDate(row.bookedAt.slice(0, 10))}
              {row.bookedAt.slice(11) !== "00:00:00" ? `, ${row.bookedAt.slice(11, 16)}` : ""}
            </Detail>
            {row.valueDate ? <Detail label="Value date">{formatDate(row.valueDate)}</Detail> : null}
            {row.cardLast4 ? <Detail label="Card">•••• {row.cardLast4}</Detail> : null}
            {row.memo ? <Detail label="Purpose">{row.memo}</Detail> : null}
            {accountName ? <Detail label="Account">{accountName}</Detail> : null}
            {row.reference ? <Detail label="Reference">{row.reference}</Detail> : null}
          </dl>
        </Section>

        <Section title="Bank statement text">
          <pre className="rounded-lg bg-wash px-3 py-2.5 font-mono text-xs leading-relaxed whitespace-pre-wrap text-ink-2">
            {row.rawText}
          </pre>
        </Section>
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-medium tracking-wide text-ink-3 uppercase">{title}</h3>
      {children}
    </section>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-ink-3">{label}</dt>
      <dd className="min-w-0 break-words text-ink">{children}</dd>
    </>
  );
}
