"use client";

import { Dialog } from "@base-ui/react/dialog";
import { Repeat, X } from "lucide-react";
import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";

import { ignoreRecurring, markRecurring, resetRecurring, setExcluded, setNote } from "@/app/actions";
import { CategorySelect, type CategoryOption } from "@/components/category-select";
import { Button } from "@/components/ui/button";
import { NativeSelect, Textarea } from "@/components/ui/field";
import { useI18n } from "@/i18n/client";
import type { MessageError } from "@/i18n/messages";
import { cn } from "@/lib/cn";
import { formatAmount, formatMoney } from "@/lib/money";
import type { Cadence } from "@/server/import/merchants";

import type { TransactionItem } from "./types";

const CADENCES: Cadence[] = ["weekly", "biweekly", "monthly", "quarterly", "semiannual", "yearly"];

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
  const { t, format } = useI18n();
  const [scope, setScope] = useState<"one" | "merchant">("one");
  const [note, setNoteDraft] = useState(row.note ?? "");
  const [cadence, setCadence] = useState<Cadence>("monthly");
  const [pending, startTransition] = useTransition();

  const direction = row.amount < 0 ? "out" : "in";
  const noteChanged = note.trim() !== (row.note ?? "");

  function run(action: () => Promise<{ ok: true } | { ok: false; error: MessageError }>, done: string) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) toast.success(done);
      else toast.error(t.error(result.error));
    });
  }

  return (
    <>
      <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <Dialog.Title className="truncate text-base font-semibold text-ink">{row.merchant}</Dialog.Title>
          <Dialog.Description className="mt-0.5 text-[13px] text-ink-2">
            {format.date(row.date)}
            {row.location ? ` · ${row.location}` : ""}
          </Dialog.Description>
        </div>
        <Dialog.Close
          aria-label={t("common.close")}
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
              {t("sheet.exchange", {
                amount: formatMoney(Math.abs(row.originalAmount), row.originalCurrency),
                rate: (Math.abs(row.amount) / Math.abs(row.originalAmount)).toFixed(4),
                pair: `${row.currency}/${row.originalCurrency}`,
              })}
            </p>
          ) : null}
        </div>

        <Section title={t("common.category")}>
          <CategorySelect
            categories={categories}
            value={row.categoryId}
            onChange={(categoryId) => onCategoryChange(row, categoryId, scope)}
            label={t("common.category")}
          />
          <fieldset className="mt-3 space-y-1.5 text-[13px] text-ink-2">
            <legend className="sr-only">{t("sheet.applyTo")}</legend>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="scope"
                checked={scope === "one"}
                onChange={() => setScope("one")}
                className="accent-(--accent)"
              />
              {t("sheet.onlyThis")}
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
                {t.rich("sheet.everythingFrom", {
                  merchant: row.merchant,
                  b: (content) => <span className="text-ink">{content}</span>,
                })}
              </span>
            </label>
          </fieldset>
          {row.categorySource === "auto" ? (
            <p className="mt-2 text-xs text-ink-3">{t("sheet.categorisedAuto")}</p>
          ) : row.categorySource === "rule" ? (
            <p className="mt-2 text-xs text-ink-3">{t("sheet.categorisedByRule")}</p>
          ) : null}
        </Section>

        <Section title={t("sheet.recurring")}>
          {row.recurringDecision === "ignore" ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-[13px] text-ink-2">{t("sheet.markedNotRecurring")}</p>
              <Button
                size="sm"
                disabled={pending}
                onClick={() => run(() => resetRecurring(row.merchantKey, direction), t("sheet.detectionRestored"))}
              >
                {t("common.undo")}
              </Button>
            </div>
          ) : row.recurringCadence ? (
            <div className="flex items-center justify-between gap-3">
              <p className="flex items-center gap-2 text-[13px] text-ink-2">
                <Repeat aria-hidden className="size-3.5" />
                {t(`repeats.${row.recurringCadence}`)}
              </p>
              <Button
                size="sm"
                disabled={pending}
                onClick={() => run(() => ignoreRecurring(row.merchantKey, direction), t("sheet.nowNotRecurring"))}
              >
                {t("recurring.notRecurring")}
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <NativeSelect
                aria-label={t("sheet.howOften")}
                value={cadence}
                onChange={(event) => setCadence(event.target.value as Cadence)}
                className="h-8 flex-1 text-[13px]"
              >
                {CADENCES.map((option) => (
                  <option key={option} value={option}>
                    {t(`cadence.${option}`)}
                  </option>
                ))}
              </NativeSelect>
              <Button
                size="sm"
                disabled={pending}
                onClick={() =>
                  run(
                    () => markRecurring(row.merchantKey, direction, cadence),
                    t("sheet.nowRecurring", { merchant: row.merchant }),
                  )
                }
              >
                {t("sheet.markRecurring")}
              </Button>
            </div>
          )}
        </Section>

        <Section title={t("sheet.note")}>
          <Textarea
            value={note}
            onChange={(event) => setNoteDraft(event.target.value)}
            rows={2}
            maxLength={500}
            placeholder={t("sheet.addNote")}
            className="w-full resize-none"
          />
          {noteChanged ? (
            <div className="mt-2 flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setNoteDraft(row.note ?? "")}>
                {t("sheet.discard")}
              </Button>
              <Button
                size="sm"
                variant="primary"
                disabled={pending}
                onClick={() => run(() => setNote(row.id, note), t("sheet.noteSaved"))}
              >
                {t("sheet.saveNote")}
              </Button>
            </div>
          ) : null}
        </Section>

        <Section title={t("sheet.counting")}>
          <label className="flex items-start gap-2.5 text-[13px] text-ink-2">
            <input
              type="checkbox"
              checked={row.excluded === 1}
              disabled={pending}
              onChange={(event) =>
                run(
                  () => setExcluded(row.id, event.target.checked),
                  event.target.checked ? t("sheet.nowExcluded") : t("sheet.nowIncluded"),
                )
              }
              className="mt-0.5 accent-(--accent)"
            />
            <span>
              {t("sheet.leaveOut")}
              {row.flow === "transfer" ? (
                <span className="block text-xs text-ink-3">{t("sheet.transfersNeverCount")}</span>
              ) : null}
            </span>
          </label>
        </Section>

        <Section title={t("sheet.details")}>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[13px]">
            <Detail label={t("sheet.booked")}>
              {format.date(row.bookedAt.slice(0, 10))}
              {row.bookedAt.slice(11) !== "00:00:00" ? `, ${row.bookedAt.slice(11, 16)}` : ""}
            </Detail>
            {row.valueDate ? <Detail label={t("sheet.valueDate")}>{format.date(row.valueDate)}</Detail> : null}
            {row.cardLast4 ? <Detail label={t("sheet.card")}>•••• {row.cardLast4}</Detail> : null}
            {row.memo ? <Detail label={t("sheet.purpose")}>{row.memo}</Detail> : null}
            {accountName ? <Detail label={t("common.account")}>{accountName}</Detail> : null}
            {row.reference ? <Detail label={t("sheet.reference")}>{row.reference}</Detail> : null}
          </dl>
        </Section>

        <Section title={t("sheet.statementText")}>
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
