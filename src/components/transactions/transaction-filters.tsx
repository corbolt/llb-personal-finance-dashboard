"use client";

import { LoaderCircle, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";

import type { CategoryOption } from "@/components/category-select";
import { Input, NativeSelect } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { href } from "@/lib/url";

export interface FilterValues {
  q: string;
  m: string;
  category: string;
  flow: string;
  account: string;
}

const SEARCH_DELAY_MS = 250;

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
      router.replace(href("/transactions", { ...preserved, ...next }), { scroll: false });
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

  const groups: Array<{ label: string; kind: CategoryOption["kind"] }> = [
    { label: "Spending", kind: "expense" },
    { label: "Income", kind: "income" },
    { label: "Transfers", kind: "transfer" },
  ];

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
          <Input
            type="search"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Search merchant, purpose, note or amount"
            aria-label="Search transactions"
            className="w-full pr-9 pl-9"
          />
          {pending ? (
            <LoaderCircle aria-hidden className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-ink-3" />
          ) : text ? (
            <button
              type="button"
              onClick={() => setText("")}
              aria-label="Clear search"
              className="absolute top-1/2 right-2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-ink-3 hover:bg-wash hover:text-ink"
            >
              <X aria-hidden className="size-3.5" />
            </button>
          ) : null}
        </div>

        <NativeSelect className="shrink-0" aria-label="Period" value={values.m} onChange={(event) => apply({ m: event.target.value })}>
          <option value="">All time</option>
          {months.map((month) => (
            <option key={month.value} value={month.value}>
              {month.label}
            </option>
          ))}
        </NativeSelect>

        <NativeSelect
          className="max-w-56 shrink-0"
          aria-label="Category"
          value={values.category}
          onChange={(event) => apply({ category: event.target.value })}
        >
          <option value="">All categories</option>
          <option value="none">Uncategorised</option>
          {groups.map((group) => (
            <optgroup key={group.kind} label={group.label}>
              {categories
                .filter((category) => category.kind === group.kind)
                .map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </NativeSelect>

        <NativeSelect className="shrink-0" aria-label="Type" value={values.flow} onChange={(event) => apply({ flow: event.target.value })}>
          <option value="">All types</option>
          <option value="expense">Spending</option>
          <option value="income">Income</option>
          <option value="transfer">Transfers</option>
        </NativeSelect>

        {accounts.length > 1 ? (
          <NativeSelect
            className="max-w-48 shrink-0"
            aria-label="Account"
            value={values.account}
            onChange={(event) => apply({ account: event.target.value })}
          >
            <option value="">All accounts</option>
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
