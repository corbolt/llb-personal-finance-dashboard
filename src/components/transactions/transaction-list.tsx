"use client";

import { EyeOff, Repeat, StickyNote } from "lucide-react";
import { useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";

import { setCategory } from "@/app/actions";
import { CategoryIcon } from "@/components/category-icon";
import { CategorySelect, type CategoryOption } from "@/components/category-select";
import { FlowAmount } from "@/components/money";
import type { Translator } from "@/i18n";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";

import { TransactionSheet } from "./transaction-sheet";
import type { TransactionItem } from "./types";

interface CategoryPatch {
  id: number;
  categoryId: number | null;
}

/**
 * Bookings grouped by day. The category of a row can be changed in place;
 * selecting a row opens its details.
 */
export function TransactionList({
  rows,
  categories,
  showAccount = false,
  accountNames = {},
}: {
  rows: TransactionItem[];
  categories: CategoryOption[];
  showAccount?: boolean;
  accountNames?: Record<number, string>;
}) {
  const { t, format } = useI18n();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [, startTransition] = useTransition();

  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const [shown, patch] = useOptimistic(rows, (current, change: CategoryPatch) =>
    current.map((row) => {
      if (row.id !== change.id) return row;
      const category = change.categoryId === null ? null : categoryById.get(change.categoryId);
      return {
        ...row,
        categoryId: change.categoryId,
        categoryName: category?.name ?? null,
        categoryIcon: category?.icon ?? null,
      };
    }),
  );

  function changeCategory(row: TransactionItem, categoryId: number | null, scope: "one" | "merchant") {
    startTransition(async () => {
      patch({ id: row.id, categoryId });
      const result = await setCategory(row.id, categoryId, scope);
      if (!result.ok) {
        toast.error(t.error(result.error));
        return;
      }
      const category =
        categoryId === null ? t("common.uncategorised") : (categoryById.get(categoryId)?.name ?? "");
      // the row's merchant name, not the result's: it is the one in the interface language
      const { merchant } = row;
      const { merchantTotal, updated } = result.data;
      if (scope === "merchant") {
        toast.success(t("transactions.movedAll", { count: updated, merchant, category }), {
          description: categoryId === null ? undefined : t("transactions.futureFollow"),
        });
      } else if (categoryId !== null && merchantTotal > 1) {
        toast.success(t("transactions.movedTo", { category }), {
          action: {
            label: t("transactions.applyToAll", { count: merchantTotal, merchant }),
            onClick: () => changeCategory(row, categoryId, "merchant"),
          },
        });
      } else {
        toast.success(t("transactions.movedTo", { category }));
      }
    });
  }

  const days: Array<{ date: string; rows: TransactionItem[] }> = [];
  for (const row of shown) {
    const last = days[days.length - 1];
    if (last && last.date === row.date) last.rows.push(row);
    else days.push({ date: row.date, rows: [row] });
  }
  const currentYear = shown[0]?.date.slice(0, 4);
  const selected = shown.find((row) => row.id === selectedId) ?? null;

  return (
    <>
      <div className="divide-y divide-hairline">
        {days.map((day) => (
          <section key={day.date} aria-label={format.dayHeading(day.date)}>
            <h3 className="sticky top-0 z-[1] bg-surface/95 px-5 py-2 text-xs font-medium text-ink-3 backdrop-blur">
              {format.dayHeading(day.date, currentYear)}
            </h3>
            <ul>
              {day.rows.map((row) => (
                <li
                  key={row.id}
                  className={cn(
                    "relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-5 py-2 transition-colors hover:bg-wash/60 sm:grid-cols-[minmax(0,1fr)_11rem_7.5rem]",
                    selectedId === row.id && sheetOpen && "bg-wash/60",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(row.id);
                      setSheetOpen(true);
                    }}
                    className="absolute inset-0 rounded-sm -outline-offset-2"
                    aria-label={t("transactions.details", {
                      merchant: row.merchant,
                      amount: formatMoney(row.amount, row.currency),
                    })}
                  />
                  <div className="pointer-events-none flex min-w-0 items-center gap-3">
                    <CategoryIcon name={row.categoryIcon} />
                    <div className="min-w-0">
                      <p className={cn("truncate text-sm text-ink", row.excluded ? "line-through decoration-ink-3" : "font-medium")}>
                        {row.merchant}
                      </p>
                      <p className="flex items-center gap-1.5 truncate text-[13px] text-ink-3">
                        {row.recurringCadence ? (
                          <Repeat aria-label={t("transactions.isRecurring")} className="size-3 shrink-0" />
                        ) : null}
                        {row.note ? (
                          <StickyNote aria-label={t("transactions.hasNote")} className="size-3 shrink-0" />
                        ) : null}
                        {row.excluded ? (
                          <EyeOff aria-label={t("transactions.isExcluded")} className="size-3 shrink-0" />
                        ) : null}
                        <span className="truncate">
                          {subline(t, row, showAccount ? accountNames[row.accountId] : undefined)}
                        </span>
                      </p>
                    </div>
                  </div>
                  <div className="relative hidden min-w-0 justify-self-start sm:block">
                    <CategorySelect
                      variant="chip"
                      categories={categories}
                      value={row.categoryId}
                      onChange={(categoryId) => changeCategory(row, categoryId, "one")}
                      label={t("transactions.categoryOf", { merchant: row.merchant })}
                    />
                  </div>
                  <div className="pointer-events-none text-right">
                    <FlowAmount
                      cents={row.amount}
                      muted={row.flow === "transfer" || row.excluded === 1}
                      className="text-sm"
                    />
                    {row.originalAmount !== null && row.originalCurrency ? (
                      <p className="text-xs text-ink-3 tabular">
                        {formatMoney(Math.abs(row.originalAmount), row.originalCurrency)}
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <TransactionSheet
        row={selected}
        open={sheetOpen && selected !== null}
        onOpenChange={setSheetOpen}
        categories={categories}
        accountName={selected && showAccount ? accountNames[selected.accountId] : undefined}
        onCategoryChange={changeCategory}
      />
    </>
  );
}

function subline(t: Translator, row: TransactionItem, accountName: string | undefined): string {
  const parts = [row.memo ?? row.location ?? kindLabel(t, row.kind)];
  if (accountName) parts.push(accountName);
  return parts.filter(Boolean).join(" · ");
}

/** What kind of booking it is, for rows that have nothing more specific to say. */
function kindLabel(t: Translator, kind: string): string {
  switch (kind) {
    case "card":
    case "payment":
    case "credit":
    case "transfer":
    case "fee":
    case "closing":
    case "standing_order":
    case "direct_debit":
    case "cash":
      return t(`bookingKind.${kind}`);
    default:
      return "";
  }
}
