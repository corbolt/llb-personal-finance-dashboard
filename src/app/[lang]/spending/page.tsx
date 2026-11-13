import { ChartColumn } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { AccountSelect } from "@/components/account-select";
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
import { getDataRange, listAccounts } from "@/server/queries/accounts";
import {
  getDailySpending,
  getIncomeByCategory,
  getMonthlyTotals,
  getSaved,
  getSavedByMonth,
  getSpendingByCategory,
  getTopMerchants,
  getTotals,
  savingsRate,
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
  // only accounts with bookings can be looked at on their own
  const allAccounts = listAccounts(db);
  const accounts = allAccounts.filter((account) => account.transactionCount > 0);
  const account = accounts.find((candidate) => String(candidate.id) === param(query.account));
  const accountId = account?.id;
  const data = getDataRange(db, accountId);

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

  const totals = getTotals(db, from, to, accountId);
  const categories = getSpendingByCategory(db, from, to, accountId);
  const income = getIncomeByCategory(db, from, to, accountId);
  const merchants = getTopMerchants(db, from, to, 10, accountId);
  const positive = categories.filter((category) => category.amount > 0);
  const refunds = categories.filter((category) => category.amount < 0);
  const spendingTotal = positive.reduce((sum, category) => sum + category.amount, 0);
  const rate = savingsRate(totals.income, totals.spending);
  const saved = getSaved(db, firstMonth, lastMonth, accountId);

  // the transaction list uses the month filter for one month, dates otherwise
  const listQuery = {
    ...(rangeKey === "month" ? { m: month } : { from: coveredFrom, to: coveredTo }),
    account: accountId,
  };
  const monthLabel = format.month(month);
  const periodLabel =
    (rangeKey === "month" ? monthLabel : `${format.date(coveredFrom)} – ${format.date(coveredTo)}`) +
    (account ? ` · ${account.name}` : "");

  // — charts —
  const trendFrom = (() => {
    const start = addMonths(bounds.max, -11);
    return start < bounds.min ? bounds.min : start;
  })();
  const trend = getMonthlyTotals(db, trendFrom, bounds.max, accountId);
  const savedByMonth = getSavedByMonth(db, trendFrom, bounds.max, accountId);
  const hasSavingsAccount = allAccounts.some((candidate) => candidate.isSavings);
  // without a savings account, "saved" can still come from savings bookings
  const showSaved = hasSavingsAccount || saved !== 0 || savedByMonth.some((entry) => entry.saved !== 0);
  const share = (part: number, whole: number) => (whole > 0 ? Math.round((part * 100) / whole) : null);
  const partialNote = (monthValue: IsoMonth): string | undefined => {
    if (monthValue === monthOf(data.firstDate!) && dayOfMonth(data.firstDate!) > 1) {
      return t("spending.partialStarts", { date: format.dayMonth(data.firstDate!) });
    }
    if (monthValue === monthOf(covered) && dayOfMonth(covered) < daysInMonth(monthValue)) {
      return t("spending.partialThrough", { date: format.dayMonth(covered) });
    }
    return undefined;
  };
  const daily = rangeKey === "month" ? getDailySpending(db, month, accountId) : [];
  const dayOf = (index: number) => format.dayMonth(`${month}-${String(index + 1).padStart(2, "0")}`);

  return (
    <>
      <PageHeader title={t("nav.spending")} description={periodLabel}>
        <nav aria-label={t("common.period")} className="inline-flex rounded-lg border border-line bg-surface p-0.5">
          {RANGES.map((range) => (
            <Link
              key={range.key}
              href={link("/spending", {
                range: range.key === "month" ? undefined : range.key,
                m: range.key === "month" ? month : undefined,
                account: accountId,
              })}
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
          <MonthSwitcher month={month} min={bounds.min} max={bounds.max} path="/spending" query={{ account: accountId }} />
        ) : null}
        {accounts.length > 1 ? (
          <AccountSelect
            accounts={accounts.map(({ id, name }) => ({ id, name }))}
            value={accountId === undefined ? "" : String(accountId)}
            path="/spending"
            query={rangeKey === "month" ? { m: month } : { range: rangeKey }}
          />
        ) : null}
      </PageHeader>

      <div className={cn("grid gap-4 sm:grid-cols-2", showSaved ? "lg:grid-cols-5" : "lg:grid-cols-4")}>
        <StatTile label={t("flow.expense")} className="sm:col-span-2 lg:col-span-1">
          <Figure cents={totals.spending} />
        </StatTile>
        <StatTile label={t("flow.income")}>
          <Figure cents={totals.income} />
        </StatTile>
        <StatTile
          label={t("common.net")}
          detail={rate === null ? undefined : t("savings.rate", { rate: format.percent(rate) })}
        >
          <Figure cents={totals.net} />
        </StatTile>
        {showSaved ? (
          <StatTile
            label={t("savings.saved")}
            detail={
              share(saved, totals.income) === null
                ? undefined
                : t("savings.ofIncome", { share: format.percent(share(saved, totals.income)!) })
            }
          >
            <Figure cents={saved} />
          </StatTile>
        ) : null}
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

      <Card className="mt-4">
        <CardHeader title={t("savings.title")} description={t("savings.description")} />
        <div className="overflow-x-auto px-5 pb-4">
          <table className="w-full text-[13px]">
            <thead className="text-left text-ink-2">
              <tr className="border-b border-hairline">
                <th scope="col" className="py-2 pr-4 font-medium">{t("common.month")}</th>
                <th scope="col" className="py-2 pl-4 text-right font-medium">{t("flow.income")}</th>
                <th scope="col" className="py-2 pl-4 text-right font-medium">{t("flow.expense")}</th>
                <th scope="col" className="py-2 pl-4 text-right font-medium">{t("savings.leftOver")}</th>
                <th scope="col" className="py-2 pl-4 text-right font-medium">{t("savings.rateColumn")}</th>
                {showSaved ? (
                  <>
                    <th scope="col" className="py-2 pl-4 text-right font-medium">{t("savings.saved")}</th>
                    <th scope="col" className="py-2 pl-4 text-right font-medium">{t("savings.share")}</th>
                  </>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {trend
                .map((entry, index) => ({ ...entry, saved: savedByMonth[index].saved }))
                .reverse()
                .map((entry) => {
                  const monthRate = savingsRate(entry.income, entry.spending);
                  const savedShare = share(entry.saved, entry.income);
                  const partial = partialNote(entry.month);
                  return (
                    <tr key={entry.month} className="border-b border-hairline last:border-0">
                      <th scope="row" className="py-1.5 pr-4 text-left font-normal whitespace-nowrap text-ink-2">
                        {format.month(entry.month)}
                        {partial ? (
                          <span title={partial} className="ml-1.5 text-ink-3">
                            ({t("savings.partial")})
                          </span>
                        ) : null}
                      </th>
                      <td className="py-1.5 pl-4 text-right text-ink tabular">
                        <Money cents={entry.income} />
                      </td>
                      <td className="py-1.5 pl-4 text-right text-ink tabular">
                        <Money cents={entry.spending} />
                      </td>
                      <td className="py-1.5 pl-4 text-right text-ink tabular">
                        <Money cents={entry.income - entry.spending} />
                      </td>
                      <td className="py-1.5 pl-4 text-right text-ink tabular">
                        {monthRate === null ? "–" : format.percent(monthRate)}
                      </td>
                      {showSaved ? (
                        <>
                          <td className="py-1.5 pl-4 text-right text-ink tabular">
                            <Money cents={entry.saved} />
                          </td>
                          <td className="py-1.5 pl-4 text-right text-ink tabular">
                            {savedShare === null ? "–" : format.percent(savedShare)}
                          </td>
                        </>
                      ) : null}
                    </tr>
                  );
                })}
            </tbody>
          </table>
          {hasSavingsAccount ? null : (
            <p className="mt-3 border-t border-hairline pt-3 text-[13px] text-ink-2">
              {t.rich("savings.noSavingsAccount", {
                a: (content) => (
                  <Link href={link("/import")} className="text-ink underline underline-offset-2">
                    {content}
                  </Link>
                ),
              })}
            </p>
          )}
        </div>
      </Card>
    </>
  );
}
