"use client";

import { LoaderCircle, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";

import type { CategoryOption } from "@/components/category-select";
import { Input, NativeSelect } from "@/components/ui/field";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/cn";

export interface FilterValues {
  q: string;
  m: string;
  category: string;
  flow: string;
  account: string;
}

const SEARCH_DELAY_MS = 250;

const KINDS: Array<CategoryOption["kind"]> = ["expense", "income", "transfer"];

/**
 * Filter bar for the transaction list. The filters live in the URL, so a
 * filtered view can be bookmarked and the back button undoes a change. While
 * the next result loads, the current list stays in place, slightly dimmed.
 */
export function TransactionFilters({
  values,
  preserved,
  months,
  categories,
  accounts,
  children,
}: {
  values: FilterValues;
  /** Search params that are not controls here but must survive a change. */
  preserved: Record<string, string | undefined>;
  months: Array<{ value: string; label: string }>;
  categories: CategoryOption[];
  accounts: Array<{ id: number; name: string }>;
  children: ReactNode;
}) {
  const { t, link } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [text, setText] = useState(values.q);
  const latest = useRef(values);
  useEffect(() => {
    latest.current = values;
  }, [values]);

  function apply(change: Partial<FilterValues>) {
    const next = { ...latest.current, ...change };
    latest.current = next;
    startTransition(() => {
      router.replace(link("/transactions", { ...preserved, ...next }), { scroll: false });
    });
  }

  // search as you type, without a request per keystroke
  useEffect(() => {
    if (text.trim() === latest.current.q) return;
    const timer = window.setTimeout(() => apply({ q: text.trim() }), SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
    // `apply` only reads refs and stable hooks
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
          <Input
            type="search"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={t("transactions.searchPlaceholder")}
            aria-label={t("transactions.search")}
            className="w-full pr-9 pl-9"
          />
          {pending ? (
            <LoaderCircle aria-hidden className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-ink-3" />
          ) : text ? (
            <button
              type="button"
              onClick={() => setText("")}
              aria-label={t("transactions.clearSearch")}
              className="absolute top-1/2 right-2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-ink-3 hover:bg-wash hover:text-ink"
            >
              <X aria-hidden className="size-3.5" />
            </button>
          ) : null}
        </div>

        <NativeSelect
          className="shrink-0"
          aria-label={t("common.period")}
          value={values.m}
          onChange={(event) => apply({ m: event.target.value })}
        >
          <option value="">{t("transactions.allTime")}</option>
          {months.map((month) => (
            <option key={month.value} value={month.value}>
              {month.label}
            </option>
          ))}
        </NativeSelect>

        <NativeSelect
          className="max-w-56 shrink-0"
          aria-label={t("common.category")}
          value={values.category}
          onChange={(event) => apply({ category: event.target.value })}
        >
          <option value="">{t("transactions.allCategories")}</option>
          <option value="none">{t("common.uncategorised")}</option>
          {KINDS.map((kind) => (
            <optgroup key={kind} label={t(`flow.${kind}`)}>
              {categories
                .filter((category) => category.kind === kind)
                .map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </NativeSelect>

        <NativeSelect
          className="shrink-0"
          aria-label={t("transactions.type")}
          value={values.flow}
          onChange={(event) => apply({ flow: event.target.value })}
        >
          <option value="">{t("transactions.allTypes")}</option>
          {KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {t(`flow.${kind}`)}
            </option>
          ))}
        </NativeSelect>

        {accounts.length > 1 ? (
          <NativeSelect
            className="max-w-48 shrink-0"
            aria-label={t("common.account")}
            value={values.account}
            onChange={(event) => apply({ account: event.target.value })}
          >
            <option value="">{t("transactions.allAccounts")}</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </NativeSelect>
        ) : null}
      </div>

      <div className={cn("transition-opacity", pending && "opacity-60")} aria-busy={pending}>
        {children}
      </div>
    </>
  );
}
