import { ArrowRight, CalendarClock, FileSpreadsheet, Upload } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { CategoryIcon } from "@/components/category-icon";
import { ChartFrame } from "@/components/charts/chart-frame";
import { DataTable } from "@/components/charts/data-table";
import { LineChart, type LineSeries } from "@/components/charts/line-chart";
import { RankedBars } from "@/components/charts/ranked-bars";
import { ImportForm } from "@/components/import/import-form";
import { Figure, FlowAmount, Money } from "@/components/money";
import { EmptyState, MonthSwitcher, PageHeader, PageSkeleton, StatTile } from "@/components/page";
import { buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import {
  addDays,
  addMonths,
  dayOfMonth,
  daysInMonth,
  formatDate,
  formatDayMonth,
  formatMonthName,
  formatRelativeDay,
  monthEnd,
  monthOf,
  monthStart,
  todayIso,
  type IsoMonth,
} from "@/lib/dates";
import { monthBounds, resolveMonth } from "@/lib/period";
import { APP_NAME } from "@/lib/site";
import { href, param } from "@/lib/url";
import { requestDb } from "@/server/db/request";
import { getDataRange, listAccounts } from "@/server/queries/accounts";
import { getDailySpending, getSpendingByCategory, getTotals } from "@/server/queries/flows";
import { getRecurring, upcomingCharges } from "@/server/queries/recurring";
import { countUncategorised, listTransactions } from "@/server/queries/transactions";

export default function OverviewPage(props: PageProps<"/">) {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title="Overview" />
          <PageSkeleton />
        </>
      }
    >
      <Overview searchParams={props.searchParams} />
    </Suspense>
  );
}

function runningTotal(values: number[]): number[] {
  let sum = 0;
  return values.map((value) => (sum += value));
}

async function Overview({ searchParams }: Pick<PageProps<"/">, "searchParams">) {
  const query = await searchParams;
  const db = await requestDb();
  const range = getDataRange(db);

  if (!range.firstDate || !range.lastDate || !range.coveredThrough) {
    return (
      <>
        <PageHeader title={`Welcome to ${APP_NAME}`} />
        <Card>
          <EmptyState icon={FileSpreadsheet} title="Start with your first bank export">
            Upload the Excel export from your online banking. Your transactions are categorised
            automatically, recurring payments are detected, and everything stays in a database file
            on this computer.
          </EmptyState>
          <CardBody>
            <ImportForm accounts={[]} compact />
          </CardBody>
        </Card>
      </>
    );
  }

  const bounds = monthBounds(range.firstDate, range.lastDate);
  const month = resolveMonth(param(query.m), bounds);
  const previous = addMonths(month, -1);
  const covered = range.coveredThrough;
  // days of the month for which data exists; fewer than all while it is running
  const daysCovered = covered >= monthEnd(month) ? daysInMonth(month) : dayOfMonth(covered);
  const running = daysCovered < daysInMonth(month);
  const previousCovered = monthStart(previous) >= range.firstDate;

  const totals = getTotals(db, monthStart(month), monthEnd(month));
  const cumulative = runningTotal(getDailySpending(db, month));
  const previousCumulative = previousCovered ? runningTotal(getDailySpending(db, previous)) : [];
  const accounts = listAccounts(db);
  const categories = getSpendingByCategory(db, monthStart(month), monthEnd(month));
  const recent = listTransactions(db, {}, { limit: 7 }).rows;
  const uncategorised = countUncategorised(db);

  const today = todayIso();
  const { series: recurring } = getRecurring(db);
  const upcoming = upcomingCharges(recurring, today, addDays(today, 30)).slice(0, 6);

  // How this month compares with the previous one at the same day.
  const comparisonDay = Math.min(daysCovered, previousCumulative.length);
  const previousAtSameDay = comparisonDay > 0 ? previousCumulative[comparisonDay - 1] : null;
  const difference = previousAtSameDay === null ? null : totals.spending - previousAtSameDay;

  const length = Math.max(daysInMonth(month), previousCumulative.length);
  const days = Array.from({ length }, (_, index) => index + 1);
  const lines: LineSeries[] = [
    {
      id: "current",
      label: formatMonthName(month),
      color: "var(--accent)",
      values: days.map((day) => (day <= daysCovered ? cumulative[day - 1] : null)),
      area: true,
      labelEnd: true,
    },
  ];
  if (previousCovered) {
    lines.push({
      id: "previous",
      label: formatMonthName(previous),
      color: "var(--context)",
      values: days.map((day) => previousCumulative[day - 1] ?? null),
    });
  }

  const positiveCategories = categories.filter((category) => category.amount > 0);
  const balanceTotal = accounts.reduce((sum, account) => sum + (account.balance ?? 0), 0);
  const balanceDate = accounts
    .map((account) => account.balanceDate)
    .filter((date): date is string => date !== null)
    .sort()
    .at(-1);

  return (
    <>
      <PageHeader
        title="Overview"
        description={
          running ? `Data through ${formatDate(covered)}` : `${formatMonthName(month)} ${month.slice(0, 4)}`
        }
      >
        <MonthSwitcher month={month} min={bounds.min} max={bounds.max} path="/" />
        <Link href="/import" className={buttonClass({ variant: "primary" })}>
          <Upload aria-hidden className="size-4" />
          Import
        </Link>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-3">
        <ChartFrame
          className="lg:col-span-2"
          title={`Spent in ${formatMonthName(month)}`}
          description={<SpendingHeadline amount={totals.spending} difference={difference} previous={previous} partial={running} />}
          legend={lines.map((line) => ({ label: line.label, color: line.color, mark: "line" as const }))}
          chart={
            <LineChart
              labels={days.map((day) => `Day ${day}`)}
              ticks={[1, 5, 10, 15, 20, 25, 30].filter((day) => day <= length).map((day) => ({ index: day - 1, label: String(day) }))}
              series={lines}
              description={`Cumulative spending in ${formatMonthName(month)} by day of the month${
                previousCovered ? `, compared with ${formatMonthName(previous)}` : ""
              }`}
            />
          }
          table={
            <DataTable
              caption="Cumulative spending by day of the month"
              rowHeader="Day"
              columns={lines.map((line) => line.label)}
              rows={days.map((day, index) => ({
                label: String(day),
                values: lines.map((line) => line.values[index]),
              }))}
            />
          }
          footnote={
            previousCovered
              ? undefined
              : `No comparison yet: the data starts on ${formatDate(range.firstDate)}.`
          }
        />

        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
          <StatTile
            label={accounts.length > 1 ? "Balance, all accounts" : "Account balance"}
            detail={balanceDate ? `as of ${formatDate(balanceDate)}` : undefined}
          >
            <Figure cents={balanceTotal} />
          </StatTile>
          <StatTile label={`Income in ${formatMonthName(month)}`}>
            <Figure cents={totals.income} />
          </StatTile>
          <StatTile
            label="Income minus spending"
            detail={totals.net >= 0 ? "left over this month" : "more spent than earned"}
          >
            <Figure cents={totals.net} />
          </StatTile>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Where it went"
            description={`Spending by category in ${formatMonthName(month)}`}
            action={<MoreLink href={href("/spending", { m: month })}>All spending</MoreLink>}
          />
          <CardBody>
            {positiveCategories.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-3">No spending in this month.</p>
            ) : (
              <RankedBars
                total={positiveCategories.reduce((sum, category) => sum + category.amount, 0)}
                items={positiveCategories.slice(0, 6).map((category) => ({
                  key: String(category.categoryId ?? "none"),
                  label: category.name,
                  icon: category.categoryId === null ? null : category.icon,
                  value: category.amount,
                  href: href("/transactions", { m: month, category: category.categoryId ?? "none" }),
                }))}
              />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Coming up"
            description="Recurring payments expected in the next 30 days"
            action={<MoreLink href="/recurring">All recurring</MoreLink>}
          />
          {upcoming.length === 0 ? (
            <EmptyState icon={CalendarClock} title="Nothing expected" className="py-8">
              Subscriptions and bills show up here once they have been seen often enough to
              recognise a rhythm.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-hairline pb-2">
              {upcoming.map(({ series, date }) => (
                <li key={`${series.key}-${date}`} className="flex items-center gap-3 px-5 py-2.5">
                  <CategoryIcon name={series.categoryIcon} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{series.merchant}</p>
                    <p className="text-[13px] text-ink-3">
                      {formatDayMonth(date)} · {formatRelativeDay(date, today)}
                    </p>
                  </div>
                  <span className="text-sm tabular">
                    {series.variable ? <span className="text-ink-3">≈ </span> : null}
                    <FlowAmount cents={series.direction === "out" ? -series.amount : series.amount} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Latest transactions"
            action={<MoreLink href="/transactions">All transactions</MoreLink>}
          />
          <ul className="divide-y divide-hairline pb-2">
            {recent.map((row) => (
              <li key={row.id} className="flex items-center gap-3 px-5 py-2.5">
                <CategoryIcon name={row.categoryIcon} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{row.merchant}</p>
                  <p className="truncate text-[13px] text-ink-3">
                    {formatDayMonth(row.date)} · {row.categoryName ?? "Uncategorised"}
                  </p>
                </div>
                <FlowAmount cents={row.amount} muted={row.flow === "transfer"} className="text-sm" />
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader title="To do" />
          <CardBody className="space-y-4">
            {uncategorised > 0 ? (
              <div>
                <p className="text-sm text-ink-2">
                  <span className="font-medium text-ink">
                    {uncategorised} {uncategorised === 1 ? "transaction has" : "transactions have"}
                  </span>{" "}
                  no category yet. Assign one per merchant and it sticks for future imports.
                </p>
                <Link href="/categories#review" className={buttonClass({ size: "sm", className: "mt-3" })}>
                  Review now
                </Link>
              </div>
            ) : (
              <p className="text-sm text-ink-2">Every transaction has a category. Nicely done.</p>
            )}
            <Staleness lastDate={covered} today={today} />
          </CardBody>
        </Card>
      </div>
    </>
  );
}

function SpendingHeadline({
  amount,
  difference,
  previous,
  partial,
}: {
  amount: number;
  difference: number | null;
  previous: IsoMonth;
  /** The month is still running, so the comparison is "at this point". */
  partial: boolean;
}) {
  return (
    <span className="mt-2 block">
      <Figure cents={amount} size="xl" className="block" />
      {difference !== null ? (
        <span className="mt-2 block text-[13px] text-ink-2">
          {difference === 0 ? (
            "Exactly as much as"
          ) : (
            <>
              <Money cents={Math.abs(difference)} whole className="font-medium text-ink" />{" "}
              {difference > 0 ? "more than" : "less than"}
            </>
          )}{" "}
          {partial ? `at this point in ${formatMonthName(previous)}` : `in ${formatMonthName(previous)}`}
        </span>
      ) : null}
    </span>
  );
}

function Staleness({ lastDate, today }: { lastDate: string; today: string }) {
  const age = Math.round((Date.parse(today) - Date.parse(lastDate)) / 86_400_000);
  if (age <= 35) return null;
  return (
    <div className="border-t border-hairline pt-4">
      <p className="text-sm text-ink-2">
        The newest transaction is from{" "}
        <span className="font-medium text-ink">{formatDate(lastDate)}</span>. Time for a fresh export
        from {formatMonthName(monthOf(addDays(lastDate, 1)))} onwards.
      </p>
      <Link href="/import" className={buttonClass({ size: "sm", className: "mt-3" })}>
        Import
      </Link>
    </div>
  );
}

function MoreLink({ href: target, children }: { href: string; children: string }) {
  return (
    <Link
      href={target}
      className="inline-flex items-center gap-1 text-[13px] text-ink-2 transition-colors hover:text-ink"
    >
      {children}
      <ArrowRight aria-hidden className="size-3.5" />
    </Link>
  );
}
