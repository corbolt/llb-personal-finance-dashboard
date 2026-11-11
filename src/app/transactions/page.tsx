import { ReceiptText, SearchX, X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";

import { Money } from "@/components/money";
import { EmptyState, PageHeader, PageSkeleton } from "@/components/page";
import { TransactionFilters, type FilterValues } from "@/components/transactions/transaction-filters";
import { TransactionList } from "@/components/transactions/transaction-list";
import type { TransactionItem } from "@/components/transactions/types";
import { buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  formatDate,
  formatMonth,
  isIsoDate,
  isIsoMonth,
  monthEnd,
  monthRange,
  monthStart,
} from "@/lib/dates";
import { monthBounds } from "@/lib/period";
import { href, param } from "@/lib/url";
import { requestDb } from "@/server/db/request";
import { getDataRange, listAccounts } from "@/server/queries/accounts";
import { listCategories } from "@/server/queries/categories";
import { getRecurring, loadOverrides } from "@/server/queries/recurring";
import { listTransactions, type Flow, type TransactionFilter } from "@/server/queries/transactions";

export const metadata: Metadata = { title: "Transactions" };

const PAGE_SIZE = 100;
const MAX_ROWS = 2000;

export default function TransactionsPage(props: PageProps<"/transactions">) {
  return (
    <>
      <PageHeader title="Transactions" />
      <Suspense fallback={<PageSkeleton rows={1} />}>
        <Transactions searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function Transactions({ searchParams }: Pick<PageProps<"/transactions">, "searchParams">) {
  const query = await searchParams;
  const db = await requestDb();
  const range = getDataRange(db);

  if (!range.firstDate || !range.lastDate) {
    return (
      <Card>
        <EmptyState
          icon={ReceiptText}
          title="No transactions yet"
          action={
            <Link href="/import" className={buttonClass({ variant: "primary" })}>
              Import a bank export
            </Link>
          }
        >
          Once you import an export from your online banking, every booking shows up here.
        </EmptyState>
      </Card>
    );
  }

  // — read the filters from the URL —
  const values: FilterValues = {
    q: param(query.q) ?? "",
    m: isIsoMonth(param(query.m) ?? "") ? param(query.m)! : "",
    category: /^(none|\d+)$/.test(param(query.category) ?? "") ? param(query.category)! : "",
    flow: /^(expense|income|transfer)$/.test(param(query.flow) ?? "") ? param(query.flow)! : "",
    account: /^\d+$/.test(param(query.account) ?? "") ? param(query.account)! : "",
  };
  const merchantKey = param(query.merchant);
  const from = isIsoDate(param(query.from) ?? "") ? param(query.from) : undefined;
  const to = isIsoDate(param(query.to) ?? "") ? param(query.to) : undefined;
  const requested = Number(param(query.show) ?? PAGE_SIZE);
  const limit = Number.isFinite(requested) ? Math.min(MAX_ROWS, Math.max(PAGE_SIZE, requested)) : PAGE_SIZE;

  const filter: TransactionFilter = {
    search: values.q || undefined,
    from: values.m ? monthStart(values.m) : from,
    to: values.m ? monthEnd(values.m) : to,
    category: values.category === "none" ? "none" : values.category ? Number(values.category) : undefined,
    flow: (values.flow || undefined) as Flow | undefined,
    accountId: values.account ? Number(values.account) : undefined,
    merchantKey,
  };
  const page = listTransactions(db, filter, { limit });

  // — what recurring detection knows about the listed bookings —
  const { series } = getRecurring(db);
  const cadenceByTransaction = new Map(
    series.flatMap((item) => item.occurrences.map((occurrence) => [occurrence.id, item.cadence] as const)),
  );
  const decisionByMerchant = new Map(
    loadOverrides(db).map((override) => [`${override.direction}:${override.merchantKey}`, override.decision]),
  );
  const rows: TransactionItem[] = page.rows.map((row) => ({
    ...row,
    recurringCadence: cadenceByTransaction.get(row.id) ?? null,
    recurringDecision: decisionByMerchant.get(`${row.amount < 0 ? "out" : "in"}:${row.merchantKey}`) ?? null,
  }));

  const categories = listCategories(db);
  const accounts = listAccounts(db);
  const bounds = monthBounds(range.firstDate, range.lastDate);
  const months = monthRange(bounds.min, bounds.max)
    .reverse()
    .map((month) => ({ value: month, label: formatMonth(month) }));

  const preserved = { merchant: merchantKey, from: values.m ? undefined : from, to: values.m ? undefined : to };
  const currentQuery = { ...preserved, ...values };
  const filtered = Object.values(currentQuery).some(Boolean);
  const merchantName = merchantKey ? (rows[0]?.merchant ?? merchantKey) : null;

  return (
    <TransactionFilters
      values={values}
      preserved={preserved}
      months={months}
      categories={categories}
      accounts={accounts.map(({ id, name }) => ({ id, name }))}
    >
      {merchantName || (!values.m && (from || to)) ? (
        <div className="mb-3 flex flex-wrap gap-2">
          {merchantName ? (
            <FilterChip href={href("/transactions", { ...currentQuery, merchant: undefined })}>
              Merchant: {merchantName}
            </FilterChip>
          ) : null}
          {!values.m && (from || to) ? (
            <FilterChip href={href("/transactions", { ...currentQuery, from: undefined, to: undefined })}>
              {from ? formatDate(from) : "Start"} – {to ? formatDate(to) : "today"}
            </FilterChip>
          ) : null}
        </div>
      ) : null}

      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-hairline px-5 py-3 text-[13px] text-ink-2">
          <p>
            <span className="font-medium text-ink">{page.total}</span>{" "}
            {page.total === 1 ? "transaction" : "transactions"}
          </p>
          <p className="flex gap-4 tabular">
            <span>
              In <Money cents={page.moneyIn} className="text-ink" />
            </span>
            <span>
              Out <Money cents={page.moneyOut} className="text-ink" />
            </span>
          </p>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon={SearchX}
            title="Nothing matches"
            action={
              filtered ? (
                <Link href="/transactions" className={buttonClass()}>
                  Clear filters
                </Link>
              ) : undefined
            }
          >
            No transaction fits this combination of filters.
          </EmptyState>
        ) : (
          <TransactionList
            rows={rows}
            categories={categories}
            showAccount={accounts.length > 1}
            accountNames={Object.fromEntries(accounts.map((account) => [account.id, account.name]))}
          />
        )}

        {page.total > rows.length ? (
          <div className="flex items-center justify-between border-t border-hairline px-5 py-3 text-[13px] text-ink-2">
            <span>
              Showing the latest {rows.length} of {page.total}
            </span>
            {limit < MAX_ROWS ? (
              <Link
                href={href("/transactions", { ...currentQuery, show: limit + PAGE_SIZE })}
                scroll={false}
                className={buttonClass({ size: "sm" })}
              >
                Show {Math.min(PAGE_SIZE, page.total - rows.length)} more
              </Link>
            ) : (
              <span>Narrow the filters to see older ones.</span>
            )}
          </div>
        ) : null}
      </Card>
    </TransactionFilters>
  );
}

function FilterChip({ href: target, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={target}
      className="inline-flex h-7 items-center gap-1.5 rounded-md bg-wash pr-1.5 pl-2.5 text-[13px] text-ink transition-colors hover:bg-wash-strong"
    >
      {children}
      <X aria-label="Remove filter" className="size-3.5 text-ink-3" />
    </Link>
  );
}
