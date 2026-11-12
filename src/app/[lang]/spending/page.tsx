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
import { MonthSwitcher } from "@/components/month-switcher";
import { EmptyState, PageHeader, PageSkeleton, StatTile } from "@/components/page";
import { buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import type { MessageKey } from "@/i18n/messages";
import { categoryName, merchantName } from "@/i18n/names";
import { getI18n } from "@/i18n/server";
import { cn } from "@/lib/cn";
import {
  addMonths,
  dayOfMonth,
  daysInMonth,
  diffDays,
  monthEnd,
  monthOf,
  monthStart,
  type IsoDate,
  type IsoMonth,
} from "@/lib/dates";
import { monthBounds, resolveMonth } from "@/lib/period";
import { param } from "@/lib/url";
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

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("nav.spending") };
}

type RangeKey = "month" | "3m" | "6m" | "12m" | "all";

const RANGES: Array<{ key: RangeKey; label: MessageKey & `spending.range.${RangeKey}` }> = [
  { key: "month", label: "spending.range.month" },
  { key: "3m", label: "spending.range.3m" },
  { key: "6m", label: "spending.range.6m" },
  { key: "12m", label: "spending.range.12m" },
  { key: "all", label: "spending.range.all" },
];

export default async function SpendingPage(props: PageProps<"/[lang]/spending">) {
  const { t } = await getI18n();
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title={t("nav.spending")} />
          <PageSkeleton label={t("common.loading")} />
        </>
      }
    >
      <Spending searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Spending({ searchParams }: Pick<PageProps<"/[lang]/spending">, "searchParams">) {
  const query = await searchParams;
  const db = await requestDb();
  const { t, format, link } = await getI18n();
  const data = getDataRange(db);

  if (!data.firstDate || !data.lastDate || !data.coveredThrough) {
    return (
      <>
        <PageHeader title={t("nav.spending")} />
        <Card>
          <EmptyState
            icon={ChartColumn}
            title={t("spending.nothing")}
            action={
              <Link href={link("/import")} className={buttonClass({ variant: "primary" })}>
                {t("common.importExport")}
              </Link>
            }
          >
            {t("spending.nothingText")}
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
  const monthLabel = format.month(month);
  const periodLabel =
    rangeKey === "month" ? monthLabel : `${format.date(coveredFrom)} – ${format.date(coveredTo)}`;

  // — charts —
  const trendFrom = (() => {
    const start = addMonths(bounds.max, -11);
    return start < bounds.min ? bounds.min : start;
  })();
  const trend = getMonthlyTotals(db, trendFrom, bounds.max);
  const partialNote = (monthValue: IsoMonth): string | undefined => {
    if (monthValue === monthOf(data.firstDate!) && dayOfMonth(data.firstDate!) > 1) {
      return t("spending.partialStarts", { date: format.dayMonth(data.firstDate!) });
    }
    if (monthValue === monthOf(covered) && dayOfMonth(covered) < daysInMonth(monthValue)) {
      return t("spending.partialThrough", { date: format.dayMonth(covered) });
    }
    return undefined;
  };
  const daily = rangeKey === "month" ? getDailySpending(db, month) : [];
  const dayOf = (index: number) => format.dayMonth(`${month}-${String(index + 1).padStart(2, "0")}`);

  return (
    <>
      <PageHeader title={t("nav.spending")} description={periodLabel}>
        <nav aria-label={t("common.period")} className="inline-flex rounded-lg border border-line bg-surface p-0.5">
          {RANGES.map((range) => (
            <Link
              key={range.key}
              href={link("/spending", { range: range.key === "month" ? undefined : range.key, m: range.key === "month" ? month : undefined })}
              scroll={false}
              aria-current={range.key === rangeKey ? "true" : undefined}
              className={cn(
                "rounded-md px-2.5 py-1.5 text-[13px] transition-colors",
                range.key === rangeKey ? "bg-wash font-medium text-ink" : "text-ink-2 hover:text-ink",
              )}
            >
              {t(range.label)}
            </Link>
          ))}
        </nav>
        {rangeKey === "month" ? (
          <MonthSwitcher month={month} min={bounds.min} max={bounds.max} path="/spending" />
        ) : null}
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label={t("flow.expense")} className="sm:col-span-2 lg:col-span-1">
          <Figure cents={totals.spending} />
        </StatTile>
        <StatTile label={t("flow.income")}>
          <Figure cents={totals.income} />
        </StatTile>
        <StatTile label={t("common.net")}>
          <Figure cents={totals.net} />
        </StatTile>
        <StatTile label={t("spending.perDay")} detail={t("spending.overDays", { count: coveredDays })}>
          <Figure cents={Math.round(totals.spending / coveredDays)} />
        </StatTile>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {rangeKey === "month" ? (
          <ChartFrame
            title={t("spending.dayByDay")}
            description={t("spending.onEachDay", { month: monthLabel })}
            chart={
              <ColumnChart
                groups={daily.map((amount, index) => ({
                  label: (index + 1) % 5 === 0 || index === 0 ? String(index + 1) : "",
                  title: dayOf(index),
                  values: [amount],
                }))}
                series={[{ id: "spending", label: t("flow.expense"), color: "var(--accent)" }]}
                directLabels="max"
                description={t("spending.perDayIn", { month: monthLabel })}
              />
            }
            table={
              <DataTable
                caption={t("spending.perDayIn", { month: monthLabel })}
                rowHeader={t("common.day")}
                columns={[t("flow.expense")]}
                rows={daily.map((amount, index) => ({ label: dayOf(index), values: [amount] }))}
              />
            }
            footnote={partialNote(month)}
          />
        ) : null}

        <ChartFrame
          className={rangeKey === "month" ? undefined : "lg:col-span-2"}
          title={t("spending.monthByMonth")}
          description={t("spending.incomeAndSpending")}
          legend={[
            { label: t("flow.income"), color: "var(--income)", mark: "bar" },
            { label: t("flow.expense"), color: "var(--accent)", mark: "bar" },
          ]}
          chart={
            <ColumnChart
              groups={trend.map((entry) => ({
                label: format.monthShort(entry.month, trend.length > 6 && entry.month.endsWith("-01")),
                title: format.month(entry.month),
                values: [entry.income, entry.spending],
                note: partialNote(entry.month),
              }))}
              series={[
                { id: "income", label: t("flow.income"), color: "var(--income)" },
                { id: "spending", label: t("flow.expense"), color: "var(--accent)" },
              ]}
              directLabels="last"
              description={t("spending.incomeAndSpendingPerMonth")}
            />
          }
          table={
            <DataTable
              caption={t("spending.incomeAndSpendingPerMonth")}
              rowHeader={t("common.month")}
              columns={[t("flow.income"), t("flow.expense")]}
              rows={trend.map((entry) => ({
                label: format.month(entry.month),
                values: [entry.income, entry.spending],
              }))}
            />
          }
          footnote={
            trend.some((entry) => partialNote(entry.month))
              ? t("spending.coverage", { from: format.date(data.firstDate), to: format.date(covered) })
              : undefined
          }
        />
      </div>

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader title={t("common.byCategory")} description={t("spending.netOfRefunds")} />
          <CardBody>
            {positive.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-3">{t("spending.noSpending")}</p>
            ) : (
              <RankedBars
                total={spendingTotal}
                items={positive.map((category) => ({
                  key: String(category.categoryId ?? "none"),
                  label: categoryName(t, category),
                  icon: category.categoryId === null ? null : category.icon,
                  value: category.amount,
                  note: `${category.count}×`,
                  href: link("/transactions", { ...listQuery, category: category.categoryId ?? "none" }),
                }))}
              />
            )}
            {refunds.length > 0 ? (
              <p className="mt-3 border-t border-hairline pt-3 text-[13px] text-ink-2">
                {t.rich("spending.refundsOutweighed", {
                  categories: refunds.map((category, index) => (
                    <span key={category.categoryId ?? "none"}>
                      {index > 0 ? ", " : ""}
                      <span className="text-ink">{categoryName(t, category)}</span> (
                      <Money cents={-category.amount} sign="always" />)
                    </span>
                  )),
                })}
              </p>
            ) : null}
          </CardBody>
        </Card>

        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title={t("spending.topMerchants")} />
            {merchants.length === 0 ? (
              <p className="px-5 pb-6 text-center text-sm text-ink-3">{t("spending.noSpending")}</p>
            ) : (
              <ol className="pb-2">
                {merchants.map((merchant) => (
                  <li key={merchant.merchantKey}>
                    <Link
                      href={link("/transactions", { ...listQuery, merchant: merchant.merchantKey })}
                      className="flex items-center gap-3 px-5 py-2 transition-colors hover:bg-wash/60"
                    >
                      <CategoryIcon name={merchant.categoryIcon} size="sm" />
                      <span className="min-w-0 flex-1 truncate text-sm text-ink">{merchantName(t, merchant)}</span>
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
              <CardHeader title={t("flow.income")} />
              <ul className="pb-2">
                {income.map((source) => (
                  <li key={source.categoryId ?? "none"}>
                    <Link
                      href={link("/transactions", { ...listQuery, category: source.categoryId ?? "none", flow: "income" })}
                      className="flex items-center gap-3 px-5 py-2 transition-colors hover:bg-wash/60"
                    >
                      <CategoryIcon name={source.categoryId === null ? null : source.icon} size="sm" />
                      <span className="min-w-0 flex-1 truncate text-sm text-ink">{categoryName(t, source)}</span>
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
