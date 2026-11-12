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
import { withCategoryName, withMerchantName } from "@/i18n/names";
import { getI18n } from "@/i18n/server";
import { isIsoDate, isIsoMonth, monthEnd, monthRange, monthStart } from "@/lib/dates";
import { monthBounds } from "@/lib/period";
import { param } from "@/lib/url";
import { requestDb } from "@/server/db/request";
import { getDataRange, listAccounts } from "@/server/queries/accounts";
import { listCategories } from "@/server/queries/categories";
import { getRecurring, loadOverrides } from "@/server/queries/recurring";
import { listTransactions, type Flow, type TransactionFilter } from "@/server/queries/transactions";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("nav.transactions") };
}

const PAGE_SIZE = 100;
const MAX_ROWS = 2000;

export default async function TransactionsPage(props: PageProps<"/[lang]/transactions">) {
  const { t } = await getI18n();
  return (
    <>
      <PageHeader title={t("nav.transactions")} />
      <Suspense fallback={<PageSkeleton label={t("common.loading")} rows={1} />}>
        <Transactions searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function Transactions({ searchParams }: Pick<PageProps<"/[lang]/transactions">, "searchParams">) {
  const query = await searchParams;
  const db = await requestDb();
  const { t, format, link } = await getI18n();
  const range = getDataRange(db);

  if (!range.firstDate || !range.lastDate) {
    return (
      <Card>
        <EmptyState
          icon={ReceiptText}
          title={t("transactions.none")}
          action={
            <Link href={link("/import")} className={buttonClass({ variant: "primary" })}>
              {t("common.importExport")}
            </Link>
          }
        >
          {t("transactions.noneText")}
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

  // categories under the names they are shown with — which is also what a search has to match
  const categories = listCategories(db).map((category) => withCategoryName(t, category));
  const needle = values.q.trim().toLowerCase();

  const filter: TransactionFilter = {
    search: values.q || undefined,
    searchCategoryIds: needle
      ? categories.filter((category) => category.name.toLowerCase().includes(needle)).map((category) => category.id)
      : undefined,
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
    ...withMerchantName(t, row),
    recurringCadence: cadenceByTransaction.get(row.id) ?? null,
    recurringDecision: decisionByMerchant.get(`${row.amount < 0 ? "out" : "in"}:${row.merchantKey}`) ?? null,
  }));

  const accounts = listAccounts(db);
  const bounds = monthBounds(range.firstDate, range.lastDate);
  const months = monthRange(bounds.min, bounds.max)
    .reverse()
    .map((month) => ({ value: month, label: format.month(month) }));

  const preserved = { merchant: merchantKey, from: values.m ? undefined : from, to: values.m ? undefined : to };
  const currentQuery = { ...preserved, ...values };
  const filtered = Object.values(currentQuery).some(Boolean);
  const merchantName = merchantKey ? (rows[0]?.merchant ?? merchantKey) : null;
  const removeFilter = t("transactions.removeFilter");

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
            <FilterChip href={link("/transactions", { ...currentQuery, merchant: undefined })} removeLabel={removeFilter}>
              {t("transactions.merchantFilter", { merchant: merchantName })}
            </FilterChip>
          ) : null}
          {!values.m && (from || to) ? (
            <FilterChip
              href={link("/transactions", { ...currentQuery, from: undefined, to: undefined })}
              removeLabel={removeFilter}
            >
              {from ? format.date(from) : t("transactions.rangeStart")} –{" "}
              {to ? format.date(to) : t("transactions.rangeToday")}
            </FilterChip>
          ) : null}
        </div>
      ) : null}

      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-hairline px-5 py-3 text-[13px] text-ink-2">
          <p>
            {t.rich("transactions.count", {
              count: page.total,
              b: (content) => <span className="font-medium text-ink">{content}</span>,
            })}
          </p>
          <p className="flex gap-4 tabular">
            <span>
              {t.rich("transactions.moneyIn", { amount: <Money cents={page.moneyIn} className="text-ink" /> })}
            </span>
            <span>
              {t.rich("transactions.moneyOut", { amount: <Money cents={page.moneyOut} className="text-ink" /> })}
            </span>
          </p>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon={SearchX}
            title={t("transactions.noMatch")}
            action={
              filtered ? (
                <Link href={link("/transactions")} className={buttonClass()}>
                  {t("transactions.clearFilters")}
                </Link>
              ) : undefined
            }
          >
            {t("transactions.noMatchText")}
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
            <span>{t("transactions.showing", { shown: rows.length, total: page.total })}</span>
            {limit < MAX_ROWS ? (
              <Link
                href={link("/transactions", { ...currentQuery, show: limit + PAGE_SIZE })}
                scroll={false}
                className={buttonClass({ size: "sm" })}
              >
                {t("transactions.showMore", { count: Math.min(PAGE_SIZE, page.total - rows.length) })}
              </Link>
            ) : (
              <span>{t("transactions.narrow")}</span>
            )}
          </div>
        ) : null}
      </Card>
    </TransactionFilters>
  );
}

function FilterChip({
  href: target,
  removeLabel,
  children,
}: {
  href: string;
  removeLabel: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={target}
      className="inline-flex h-7 items-center gap-1.5 rounded-md bg-wash pr-1.5 pl-2.5 text-[13px] text-ink transition-colors hover:bg-wash-strong"
    >
      {children}
      <X aria-label={removeLabel} className="size-3.5 text-ink-3" />
    </Link>
  );
}
