import { ArrowRight, CalendarClock, FileSpreadsheet, Upload } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { AccountSelect } from "@/components/account-select";
import { CategoryIcon } from "@/components/category-icon";
import { ChartFrame } from "@/components/charts/chart-frame";
import { DataTable } from "@/components/charts/data-table";
import { LineChart, type LineSeries } from "@/components/charts/line-chart";
import { RankedBars } from "@/components/charts/ranked-bars";
import { ImportForm } from "@/components/import/import-form";
import { Figure, FlowAmount, Money } from "@/components/money";
import { MonthSwitcher } from "@/components/month-switcher";
import { EmptyState, PageHeader, PageSkeleton, StatTile } from "@/components/page";
import { buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { categoryName, merchantName } from "@/i18n/names";
import { getI18n } from "@/i18n/server";
import {
  addDays,
  addMonths,
  dayOfMonth,
  daysInMonth,
  monthEnd,
  monthOf,
  monthRange,
  monthStart,
  todayIso,
  type IsoDate,
  type IsoMonth,
} from "@/lib/dates";
import { monthBounds, resolveMonth } from "@/lib/period";
import { APP_NAME } from "@/lib/site";
import { param } from "@/lib/url";
import { requestDb } from "@/server/db/request";
import { getDataRange, getYearBalances, listAccounts } from "@/server/queries/accounts";
import { getDailySpending, getSpendingByCategory, getTotals, savingsRate } from "@/server/queries/flows";
import { getRecurring, upcomingCharges } from "@/server/queries/recurring";
import { countUncategorised, listTransactions } from "@/server/queries/transactions";

export default async function OverviewPage(props: PageProps<"/[lang]">) {
  const { t } = await getI18n();
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title={t("nav.overview")} />
          <PageSkeleton label={t("common.loading")} />
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

async function Overview({ searchParams }: Pick<PageProps<"/[lang]">, "searchParams">) {
  const query = await searchParams;
  const db = await requestDb();
  const { t, format, link } = await getI18n();
  const range = getDataRange(db);

  if (!range.firstDate || !range.lastDate || !range.coveredThrough) {
    return (
      <>
        <PageHeader title={t("overview.welcome", { app: APP_NAME })} />
        <Card>
          <EmptyState icon={FileSpreadsheet} title={t("overview.start.title")}>
            {t("overview.start.text")}
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

  const monthLabel = format.monthName(month);
  const previousLabel = format.monthName(previous);
  const length = Math.max(daysInMonth(month), previousCumulative.length);
  const days = Array.from({ length }, (_, index) => index + 1);
  const lines: LineSeries[] = [
    {
      id: "current",
      label: monthLabel,
      color: "var(--accent)",
      values: days.map((day) => (day <= daysCovered ? cumulative[day - 1] : null)),
      area: true,
      labelEnd: true,
    },
  ];
  if (previousCovered) {
    lines.push({
      id: "previous",
      label: previousLabel,
      color: "var(--context)",
      values: days.map((day) => previousCumulative[day - 1] ?? null),
    });
  }

  const rate = savingsRate(totals.income, totals.spending);
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
        title={t("nav.overview")}
        description={running ? t("overview.dataThrough", { date: format.date(covered) }) : format.month(month)}
      >
        <MonthSwitcher month={month} min={bounds.min} max={bounds.max} path="/" />
        <Link href={link("/import")} className={buttonClass({ variant: "primary" })}>
          <Upload aria-hidden className="size-4" />
          {t("common.import")}
        </Link>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-3">
        <ChartFrame
          className="lg:col-span-2"
          title={t("overview.spentIn", { month: monthLabel })}
          description={<SpendingHeadline amount={totals.spending} difference={difference} previous={previous} partial={running} />}
          legend={lines.map((line) => ({ label: line.label, color: line.color, mark: "line" as const }))}
          chart={
            <LineChart
              labels={days.map((day) => t("overview.dayLabel", { day }))}
              ticks={[1, 5, 10, 15, 20, 25, 30].filter((day) => day <= length).map((day) => ({ index: day - 1, label: String(day) }))}
              series={lines}
              description={
                previousCovered
                  ? t("overview.chartCompared", { month: monthLabel, previous: previousLabel })
                  : t("overview.chart", { month: monthLabel })
              }
            />
          }
          table={
            <DataTable
              caption={t("overview.tableCaption")}
              rowHeader={t("common.day")}
              columns={lines.map((line) => line.label)}
              rows={days.map((day, index) => ({
                label: String(day),
                values: lines.map((line) => line.values[index]),
              }))}
            />
          }
          footnote={
            previousCovered ? undefined : t("overview.noComparison", { date: format.date(range.firstDate) })
          }
        />

        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
          <StatTile
            label={accounts.length > 1 ? t("overview.balanceAll") : t("overview.balance")}
            detail={balanceDate ? t("overview.asOf", { date: format.date(balanceDate) }) : undefined}
          >
            <Figure cents={balanceTotal} />
            {accounts.length > 1 ? (
              <ul aria-label={t("overview.balanceByAccount")} className="mt-3 space-y-1.5 border-t border-hairline pt-3">
                {accounts.map((account) => (
                  <li key={account.id} className="flex items-baseline justify-between gap-3 text-[13px]">
                    <Link
                      href={link("/transactions", { account: account.id })}
                      className="min-w-0 truncate text-ink-2 transition-colors hover:text-ink"
                    >
                      {account.name}
                    </Link>
                    {account.balance === null ? (
                      <span className="text-ink-3">—</span>
                    ) : (
                      <Money
                        cents={account.balance}
                        currency={account.currency}
                        className="text-ink tabular"
                      />
                    )}
                  </li>
                ))}
              </ul>
            ) : null}
          </StatTile>
          <StatTile label={t("overview.incomeIn", { month: monthLabel })}>
            <Figure cents={totals.income} />
          </StatTile>
          <StatTile
            label={t("common.net")}
            detail={
              <>
                {totals.net >= 0 ? t("overview.leftOver") : t("overview.overspent")}
                {rate === null ? null : <span className="block">{t("savings.rate", { rate: format.percent(rate) })}</span>}
              </>
            }
          >
            <Figure cents={totals.net} />
          </StatTile>
        </div>
      </div>

      <YearBalance year={month.slice(0, 4)} through={covered} account={param(query.account)} month={param(query.m)} />

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title={t("overview.whereItWent")}
            description={t("overview.byCategoryIn", { month: monthLabel })}
            action={<MoreLink href={link("/spending", { m: month })}>{t("overview.allSpending")}</MoreLink>}
          />
          <CardBody>
            {positiveCategories.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-3">{t("overview.noSpending")}</p>
            ) : (
              <RankedBars
                total={positiveCategories.reduce((sum, category) => sum + category.amount, 0)}
                items={positiveCategories.slice(0, 6).map((category) => ({
                  key: String(category.categoryId ?? "none"),
                  label: categoryName(t, category),
                  icon: category.categoryId === null ? null : category.icon,
                  value: category.amount,
                  href: link("/transactions", { m: month, category: category.categoryId ?? "none" }),
                }))}
              />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title={t("overview.comingUp")}
            description={t("overview.comingUpDescription")}
            action={<MoreLink href={link("/recurring")}>{t("overview.allRecurring")}</MoreLink>}
          />
          {upcoming.length === 0 ? (
            <EmptyState icon={CalendarClock} title={t("overview.nothingExpected")} className="py-8">
              {t("overview.nothingExpectedText")}
            </EmptyState>
          ) : (
            <ul className="divide-y divide-hairline pb-2">
              {upcoming.map(({ series, date }) => (
                <li key={`${series.key}-${date}`} className="flex items-center gap-3 px-5 py-2.5">
                  <CategoryIcon name={series.categoryIcon} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{merchantName(t, series)}</p>
                    <p className="text-[13px] text-ink-3">
                      {format.dayMonth(date)} · {format.relativeDay(date, today)}
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
            title={t("overview.latest")}
            action={<MoreLink href={link("/transactions")}>{t("overview.allTransactions")}</MoreLink>}
          />
          <ul className="divide-y divide-hairline pb-2">
            {recent.map((row) => (
              <li key={row.id} className="flex items-center gap-3 px-5 py-2.5">
                <CategoryIcon name={row.categoryIcon} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{merchantName(t, row)}</p>
                  <p className="truncate text-[13px] text-ink-3">
                    {format.dayMonth(row.date)} ·{" "}
                    {categoryName(t, { name: row.categoryName, slug: row.categorySlug })}
                  </p>
                </div>
                <FlowAmount cents={row.amount} muted={row.flow === "transfer"} className="text-sm" />
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader title={t("overview.todo")} />
          <CardBody className="space-y-4">
            {uncategorised > 0 ? (
              <div>
                <p className="text-sm text-ink-2">
                  {t.rich("overview.uncategorised", {
                    count: uncategorised,
                    b: (content) => <span className="font-medium text-ink">{content}</span>,
                  })}
                </p>
                <Link href={link("/categories#review")} className={buttonClass({ size: "sm", className: "mt-3" })}>
                  {t("overview.reviewNow")}
                </Link>
              </div>
            ) : (
              <p className="text-sm text-ink-2">{t("overview.allCategorised")}</p>
            )}
            <Staleness lastDate={covered} today={today} />
          </CardBody>
        </Card>
      </div>
    </>
  );
}

/**
 * The balance through a whole year: every account together, or the one
 * picked in the card. The table lists the balance at the end of each month.
 */
async function YearBalance({
  year,
  through,
  account: requested,
  month,
}: {
  year: string;
  /** The day the data reaches. */
  through: IsoDate;
  /** The `account` search param. */
  account: string | undefined;
  /** The `m` search param, kept when switching accounts. */
  month: string | undefined;
}) {
  const db = await requestDb();
  const { t, format } = await getI18n();
  const balances = getYearBalances(db, year, through);
  const title = t("overview.balanceIn", { year });

  const anyBalance = balances.accounts.some((account) => account.values.some((value) => value !== null));
  const selected = balances.accounts.find((account) => String(account.id) === requested);
  const several = balances.accounts.length > 1;
  const values = selected ? selected.values : balances.total;
  const currency = selected?.currency ?? balances.accounts[0]?.currency;
  const label = selected?.name ?? (several ? t("overview.balanceTotal") : balances.accounts[0]?.name ?? "");
  const picker = several ? (
    <AccountSelect
      accounts={balances.accounts.map(({ id, name }) => ({ id, name }))}
      value={selected ? String(selected.id) : ""}
      path="/"
      query={{ m: month }}
    />
  ) : undefined;

  if (!values.some((value) => value !== null)) {
    return (
      <Card className="mt-4">
        <CardHeader title={title} action={picker} />
        <CardBody>
          <p className="text-sm text-ink-2">
            {anyBalance
              ? t("overview.balanceMissing", { account: label, year })
              : t.rich("overview.balanceNone", { year, em: (content) => <em>{content}</em> })}
          </p>
        </CardBody>
      </Card>
    );
  }

  const first = values.findIndex((value) => value !== null);
  const last = values.findLastIndex((value) => value !== null);
  const latest = values[last]!;
  const change = first >= 0 && last > first ? latest - values[first]! : null;
  const firstDay = balances.days[first];
  const lastMonth = balances.days[last].slice(0, 7);

  // The total starts later than the year's data when an account was added later.
  const totalStart = balances.total.findIndex((value) => value !== null);
  const accountsStart = Math.min(
    ...balances.accounts.map((account) => {
      const index = account.values.findIndex((value) => value !== null);
      return index < 0 ? Infinity : index;
    }),
  );
  const totalStartsLate = !selected && several && totalStart > accountsStart;

  // Balance at the end of each month, or on the last day with data in a running month.
  const months = monthRange(`${year}-01`, lastMonth);
  const atMonthEnd = (series: Array<number | null>, month: IsoMonth) =>
    series[Math.min(balances.days.indexOf(monthEnd(month)), last)] ?? null;
  const columns = selected
    ? [{ label: selected.name, values: selected.values }]
    : [
        ...balances.accounts.map((account) => ({ label: account.name, values: account.values })),
        ...(several ? [{ label: t("overview.balanceTotal"), values: balances.total }] : []),
      ];

  return (
    <ChartFrame
      className="mt-4"
      title={title}
      description={
        <span className="mt-2 block">
          <Figure cents={latest} currency={currency} size="xl" className="block" />
          <span className="mt-2 block text-[13px] text-ink-2">
            {label} · {t("overview.asOf", { date: format.date(balances.days[last]) })}
            {change === null ? null : (
              <span className="block">
                {change === 0
                  ? t("overview.balanceSame", { date: format.date(firstDay) })
                  : t.rich(change > 0 ? "overview.balanceUp" : "overview.balanceDown", {
                      amount: (
                        <Money cents={Math.abs(change)} currency={currency} whole className="font-medium text-ink" />
                      ),
                      date: format.date(firstDay),
                    })}
              </span>
            )}
          </span>
        </span>
      }
      action={picker}
      chart={
        <LineChart
          labels={balances.days.map((day) => format.date(day))}
          ticks={months
            .concat(monthRange(addMonths(lastMonth, 1), `${year}-12`))
            .map((month) => ({
              index: balances.days.indexOf(monthStart(month)),
              label: format.monthShort(month),
              // every quarter on narrow screens
              className: Number(month.slice(5, 7)) % 3 === 1 ? undefined : "max-sm:hidden",
            }))}
          series={[{ id: "balance", label, color: "var(--context)", values, area: true, labelEnd: true }]}
          currency={currency}
          description={`${t("overview.balanceChart", { year })}: ${label}`}
        />
      }
      table={
        <DataTable
          caption={t("overview.balanceTable", { year })}
          rowHeader={t("common.month")}
          columns={columns.map((column) => column.label)}
          rows={months.map((month) => ({
            label: format.month(month),
            values: columns.map((column) => atMonthEnd(column.values, month)),
          }))}
        />
      }
      footnote={totalStartsLate ? t("overview.balanceTotalFrom", { date: format.date(balances.days[totalStart]) }) : undefined}
    />
  );
}

async function SpendingHeadline({
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
  const { t, format } = await getI18n();
  const month = format.monthName(previous);

  function comparison(difference: number) {
    if (difference === 0) {
      return partial ? t("overview.compare.sameSoFar", { month }) : t("overview.compare.same", { month });
    }
    const more = difference > 0;
    const key = partial
      ? more
        ? "overview.compare.moreSoFar"
        : "overview.compare.lessSoFar"
      : more
        ? "overview.compare.more"
        : "overview.compare.less";
    return t.rich(key, {
      amount: <Money cents={Math.abs(difference)} whole className="font-medium text-ink" />,
      month,
    });
  }

  return (
    <span className="mt-2 block">
      <Figure cents={amount} size="xl" className="block" />
      {difference !== null ? (
        <span className="mt-2 block text-[13px] text-ink-2">{comparison(difference)}</span>
      ) : null}
    </span>
  );
}

async function Staleness({ lastDate, today }: { lastDate: string; today: string }) {
  const age = Math.round((Date.parse(today) - Date.parse(lastDate)) / 86_400_000);
  if (age <= 35) return null;
  const { t, format, link } = await getI18n();
  return (
    <div className="border-t border-hairline pt-4">
      <p className="text-sm text-ink-2">
        {t.rich("overview.stale", {
          date: format.date(lastDate),
          month: format.monthName(monthOf(addDays(lastDate, 1))),
          b: (content) => <span className="font-medium text-ink">{content}</span>,
        })}
      </p>
      <Link href={link("/import")} className={buttonClass({ size: "sm", className: "mt-3" })}>
        {t("common.import")}
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
