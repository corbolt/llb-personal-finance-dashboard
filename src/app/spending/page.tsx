import { ChartColumn } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { CategoryIcon } from "@/components/category-icon";
import { ChartFrame } from "@/components/charts/chart-frame";
import { ColumnChart } from "@/components/charts/column-chart";
import { DataTable } from "@/components/charts/data-table";
import { RankedBars } from "@/components/charts/ranked-bars";
import { Figure, Money } from "@/components/money";
import { EmptyState, MonthSwitcher, PageHeader, PageSkeleton, StatTile } from "@/components/page";
import { buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import {
  addMonths,
  dayOfMonth,
  daysInMonth,
  diffDays,
  formatDate,
  formatDayMonth,
  formatMonth,
  formatMonthShort,
  monthEnd,
  monthOf,
  monthStart,
  type IsoDate,
  type IsoMonth,
} from "@/lib/dates";
import { monthBounds, resolveMonth } from "@/lib/period";
import { href, param } from "@/lib/url";
import { requestDb } from "@/server/db/request";
import { getDataRange } from "@/server/queries/accounts";
import {
  getDailySpending,
  getIncomeByCategory,
  getMonthlyTotals,
  getSpendingByCategory,
  getTopMerchants,
  getTotals,
} from "@/server/queries/flows";

export const metadata: Metadata = { title: "Spending" };

type RangeKey = "month" | "3m" | "6m" | "12m" | "all";

const RANGES: Array<{ key: RangeKey; label: string }> = [
  { key: "month", label: "Month" },
  { key: "3m", label: "3 months" },
  { key: "6m", label: "6 months" },
  { key: "12m", label: "12 months" },
  { key: "all", label: "All" },
];

export default function SpendingPage(props: PageProps<"/spending">) {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title="Spending" />
          <PageSkeleton />
        </>
      }
    >
      <Spending searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Spending({ searchParams }: Pick<PageProps<"/spending">, "searchParams">) {
  const query = await searchParams;
  const db = await requestDb();
  const data = getDataRange(db);

  if (!data.firstDate || !data.lastDate || !data.coveredThrough) {
    return (
      <>
        <PageHeader title="Spending" />
        <Card>
          <EmptyState
            icon={ChartColumn}
            title="Nothing to analyse yet"
            action={
              <Link href="/import" className={buttonClass({ variant: "primary" })}>
                Import a bank export
              </Link>
            }
          >
            Import your transactions to see where the money goes.
          </EmptyState>
        </Card>
      </>
    );
  }

  const bounds = monthBounds(data.firstDate, data.lastDate);
  const rangeKey = (RANGES.find((range) => range.key === param(query.range))?.key ?? "month") as RangeKey;
  const month = resolveMonth(param(query.m), bounds);

  // — the period under the lens —
  const lastMonth: IsoMonth = rangeKey === "month" ? month : bounds.max;
  const firstMonth: IsoMonth = (() => {
    if (rangeKey === "month") return month;
    if (rangeKey === "all") return bounds.min;
    const earliest = addMonths(lastMonth, -(Number(rangeKey.replace("m", "")) - 1));
    return earliest < bounds.min ? bounds.min : earliest;
  })();
  const from: IsoDate = monthStart(firstMonth);
  const to: IsoDate = monthEnd(lastMonth);
  // never count days without data into averages
  const coveredFrom = from < data.firstDate ? data.firstDate : from;
  const covered = data.coveredThrough;
  const coveredTo = to > covered ? covered : to;
  const coveredDays = Math.max(1, diffDays(coveredFrom, coveredTo) + 1);

  const totals = getTotals(db, from, to);
  const categories = getSpendingByCategory(db, from, to);
  const income = getIncomeByCategory(db, from, to);
  const merchants = getTopMerchants(db, from, to, 10);
  const positive = categories.filter((category) => category.amount > 0);
  const refunds = categories.filter((category) => category.amount < 0);
  const spendingTotal = positive.reduce((sum, category) => sum + category.amount, 0);

  // the transaction list uses the month filter for one month, dates otherwise
  const listQuery = rangeKey === "month" ? { m: month } : { from: coveredFrom, to: coveredTo };
  const periodLabel =
    rangeKey === "month"
      ? formatMonth(month)
      : `${formatDate(coveredFrom)} – ${formatDate(coveredTo)}`;

  // — charts —
  const trendFrom = (() => {
    const start = addMonths(bounds.max, -11);
    return start < bounds.min ? bounds.min : start;
  })();
  const trend = getMonthlyTotals(db, trendFrom, bounds.max);
  const partialNote = (monthValue: IsoMonth): string | undefined => {
    if (monthValue === monthOf(data.firstDate!) && dayOfMonth(data.firstDate!) > 1) {
      return `Partial: data starts ${formatDayMonth(data.firstDate!)}`;
    }
    if (monthValue === monthOf(covered) && dayOfMonth(covered) < daysInMonth(monthValue)) {
      return `Partial: data through ${formatDayMonth(covered)}`;
    }
    return undefined;
  };
  const daily = rangeKey === "month" ? getDailySpending(db, month) : [];

  return (
    <>
      <PageHeader title="Spending" description={periodLabel}>
        <nav aria-label="Period" className="inline-flex rounded-lg border border-line bg-surface p-0.5">
          {RANGES.map((range) => (
            <Link
              key={range.key}
              href={href("/spending", { range: range.key === "month" ? undefined : range.key, m: range.key === "month" ? month : undefined })}
              scroll={false}
              aria-current={range.key === rangeKey ? "true" : undefined}
              className={cn(
                "rounded-md px-2.5 py-1.5 text-[13px] transition-colors",
                range.key === rangeKey ? "bg-wash font-medium text-ink" : "text-ink-2 hover:text-ink",
              )}
            >
              {range.label}
            </Link>
          ))}
        </nav>
        {rangeKey === "month" ? (
          <MonthSwitcher month={month} min={bounds.min} max={bounds.max} path="/spending" />
        ) : null}
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Spending" className="sm:col-span-2 lg:col-span-1">
          <Figure cents={totals.spending} />
        </StatTile>
        <StatTile label="Income">
          <Figure cents={totals.income} />
        </StatTile>
        <StatTile label="Income minus spending">
          <Figure cents={totals.net} />
        </StatTile>
        <StatTile label="Spending per day" detail={`over ${coveredDays} ${coveredDays === 1 ? "day" : "days"} with data`}>
          <Figure cents={Math.round(totals.spending / coveredDays)} />
        </StatTile>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {rangeKey === "month" ? (
          <ChartFrame
            title="Day by day"
            description={`Spending on each day of ${formatMonth(month)}`}
            chart={
              <ColumnChart
                groups={daily.map((amount, index) => ({
                  label: (index + 1) % 5 === 0 || index === 0 ? String(index + 1) : "",
                  title: formatDayMonth(`${month}-${String(index + 1).padStart(2, "0")}`),
                  values: [amount],
                }))}
                series={[{ id: "spending", label: "Spending", color: "var(--accent)" }]}
                directLabels="max"
                description={`Spending per day in ${formatMonth(month)}`}
              />
            }
            table={
              <DataTable
                caption={`Spending per day in ${formatMonth(month)}`}
                rowHeader="Day"
                columns={["Spending"]}
                rows={daily.map((amount, index) => ({
                  label: formatDayMonth(`${month}-${String(index + 1).padStart(2, "0")}`),
                  values: [amount],
                }))}
              />
            }
            footnote={partialNote(month)}
          />
        ) : null}

        <ChartFrame
          className={rangeKey === "month" ? undefined : "lg:col-span-2"}
          title="Month by month"
          description="Income and spending"
          legend={[
            { label: "Income", color: "var(--income)", mark: "bar" },
            { label: "Spending", color: "var(--accent)", mark: "bar" },
          ]}
          chart={
            <ColumnChart
              groups={trend.map((entry) => ({
                label: formatMonthShort(entry.month, trend.length > 6 && entry.month.endsWith("-01")),
                title: formatMonth(entry.month),
                values: [entry.income, entry.spending],
                note: partialNote(entry.month),
              }))}
              series={[
                { id: "income", label: "Income", color: "var(--income)" },
                { id: "spending", label: "Spending", color: "var(--accent)" },
              ]}
              directLabels="last"
              description="Income and spending per month"
            />
          }
          table={
            <DataTable
              caption="Income and spending per month"
              rowHeader="Month"
              columns={["Income", "Spending"]}
              rows={trend.map((entry) => ({
                label: formatMonth(entry.month),
                values: [entry.income, entry.spending],
              }))}
            />
          }
          footnote={
            trend.some((entry) => partialNote(entry.month))
              ? `Data covers ${formatDate(data.firstDate)} to ${formatDate(covered)}; the first and last month may be incomplete.`
              : undefined
          }
        />
      </div>

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader title="By category" description="Net of refunds" />
          <CardBody>
            {positive.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-3">No spending in this period.</p>
            ) : (
              <RankedBars
                total={spendingTotal}
                items={positive.map((category) => ({
                  key: String(category.categoryId ?? "none"),
                  label: category.name,
                  icon: category.categoryId === null ? null : category.icon,
                  value: category.amount,
                  note: `${category.count}×`,
                  href: href("/transactions", { ...listQuery, category: category.categoryId ?? "none" }),
                }))}
              />
            )}
            {refunds.length > 0 ? (
              <p className="mt-3 border-t border-hairline pt-3 text-[13px] text-ink-2">
                Refunds outweighed spending in{" "}
                {refunds.map((category, index) => (
                  <span key={category.categoryId ?? "none"}>
                    {index > 0 ? ", " : ""}
                    <span className="text-ink">{category.name}</span> (
                    <Money cents={-category.amount} sign="always" />)
                  </span>
                ))}
                .
              </p>
            ) : null}
          </CardBody>
        </Card>

        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title="Top merchants" />
            {merchants.length === 0 ? (
              <p className="px-5 pb-6 text-center text-sm text-ink-3">No spending in this period.</p>
            ) : (
              <ol className="pb-2">
                {merchants.map((merchant) => (
                  <li key={merchant.merchantKey}>
                    <Link
                      href={href("/transactions", { ...listQuery, merchant: merchant.merchantKey })}
                      className="flex items-center gap-3 px-5 py-2 transition-colors hover:bg-wash/60"
                    >
                      <CategoryIcon name={merchant.categoryIcon} size="sm" />
                      <span className="min-w-0 flex-1 truncate text-sm text-ink">{merchant.merchant}</span>
                      <span className="text-[13px] text-ink-3 tabular">{merchant.count}×</span>
                      <Money cents={merchant.amount} className="w-24 text-right text-sm text-ink tabular" />
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          {income.length > 0 ? (
            <Card>
              <CardHeader title="Income" />
              <ul className="pb-2">
                {income.map((source) => (
                  <li key={source.categoryId ?? "none"}>
                    <Link
                      href={href("/transactions", { ...listQuery, category: source.categoryId ?? "none", flow: "income" })}
                      className="flex items-center gap-3 px-5 py-2 transition-colors hover:bg-wash/60"
                    >
                      <CategoryIcon name={source.categoryId === null ? null : source.icon} size="sm" />
                      <span className="min-w-0 flex-1 truncate text-sm text-ink">{source.name}</span>
                      <Money cents={source.amount} className="text-sm text-ink tabular" />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
