import { CalendarClock, ChevronDown, Repeat } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { CategoryIcon } from "@/components/category-icon";
import { Figure, FlowAmount, Money } from "@/components/money";
import { EmptyState, PageHeader, PageSkeleton, StatTile } from "@/components/page";
import { IgnoreRecurringButton, RestoreRecurringButton } from "@/components/recurring/recurring-actions";
import { buttonClass } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { addDays, formatDate, formatDayMonth, formatRelativeDay, todayIso } from "@/lib/dates";
import { href } from "@/lib/url";
import { requestDb } from "@/server/db/request";
import { getRecurring, listIgnoredRecurring, upcomingCharges } from "@/server/queries/recurring";
import { CADENCE_LABEL, type RecurringSeries } from "@/server/recurring/detect";

export const metadata: Metadata = { title: "Recurring" };

export default function RecurringPage() {
  return (
    <>
      <PageHeader
        title="Recurring"
        description="Subscriptions, bills and regular income found in your transactions"
      />
      <Suspense fallback={<PageSkeleton />}>
        <Recurring />
      </Suspense>
    </>
  );
}

function evidenceLabel(series: RecurringSeries): string {
  switch (series.evidence) {
    case "confirmed":
      return "Marked by you";
    case "pattern":
      return series.variable ? "Paid every month" : "Same amount at a steady rhythm";
    case "period":
      return "Billing period named in the statement";
    case "known":
      return "Known subscription or utility";
    case "keyword":
      return "Recognised from the booking text";
  }
}

async function Recurring() {
  const db = await requestDb();
  const { series, dataThrough } = getRecurring(db);
  const ignored = listIgnoredRecurring(db);

  if (!dataThrough) {
    return (
      <Card>
        <EmptyState
          icon={Repeat}
          title="Nothing to look through yet"
          action={
            <Link href="/import" className={buttonClass({ variant: "primary" })}>
              Import a bank export
            </Link>
          }
        >
          Recurring payments are detected from your transactions once you import them.
        </EmptyState>
      </Card>
    );
  }

  const active = series.filter((item) => item.active);
  const costs = active.filter((item) => item.direction === "out").sort((a, b) => b.monthlyAmount - a.monthlyAmount);
  const income = active.filter((item) => item.direction === "in").sort((a, b) => b.monthlyAmount - a.monthlyAmount);
  const inactive = series.filter((item) => !item.active);

  const monthlyCosts = costs.reduce((sum, item) => sum + item.monthlyAmount, 0);
  const monthlyIncome = income.reduce((sum, item) => sum + item.monthlyAmount, 0);

  const today = todayIso();
  const upcoming = upcomingCharges(series, today, addDays(today, 30));

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Fixed costs per month" detail={`${costs.length} bills and subscriptions`}>
          <Figure cents={monthlyCosts} />
        </StatTile>
        <StatTile label="Fixed costs per year">
          <Figure cents={monthlyCosts * 12} />
        </StatTile>
        <StatTile label="Regular income per month">
          <Figure cents={monthlyIncome} />
        </StatTile>
        <StatTile label="Left after fixed costs" detail="per month, for everything else">
          <Figure cents={monthlyIncome - monthlyCosts} />
        </StatTile>
      </div>

      {series.length === 0 ? (
        <Card>
          <EmptyState icon={Repeat} title="No recurring payments found yet">
            A payment is recognised once it has repeated — the same amount a month apart, say — or
            when the statement names a billing period. With more months imported, more will show up.
            You can also mark any transaction as recurring from its details.
          </EmptyState>
        </Card>
      ) : null}

      {upcoming.length > 0 ? (
        <Card>
          <CardHeader
            title="Next 30 days"
            description={`Expected from ${formatDate(today)}, based on each payment's rhythm`}
          />
          <ul className="divide-y divide-hairline pb-2">
            {upcoming.map(({ series: item, date }) => (
              <li key={`${item.key}-${date}`} className="flex items-center gap-3 px-5 py-2.5">
                <span className="w-16 shrink-0 text-[13px] text-ink-2 tabular">{formatDayMonth(date)}</span>
                <CategoryIcon name={item.categoryIcon} size="sm" />
                <span className="min-w-0 flex-1 truncate text-sm text-ink">{item.merchant}</span>
                <span className="hidden text-[13px] text-ink-3 sm:inline">{formatRelativeDay(date, today)}</span>
                <span className="w-28 text-right text-sm tabular">
                  {item.variable ? <span className="text-ink-3">≈ </span> : null}
                  <FlowAmount cents={item.direction === "out" ? -item.amount : item.amount} />
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {costs.length > 0 ? (
        <SeriesCard title="Bills and subscriptions" description="Sorted by what they cost per month" series={costs} />
      ) : null}
      {income.length > 0 ? <SeriesCard title="Regular income" series={income} /> : null}
      {inactive.length > 0 ? (
        <SeriesCard
          title="Possibly ended"
          description={`No payment when one was due — judged by the data through ${formatDate(dataThrough)}`}
          series={inactive}
        />
      ) : null}

      {ignored.length > 0 ? (
        <Card>
          <CardHeader title="Marked as not recurring" />
          <ul className="divide-y divide-hairline pb-2">
            {ignored.map((item) => (
              <li key={`${item.direction}-${item.merchantKey}`} className="flex items-center gap-3 px-5 py-2">
                <span className="min-w-0 flex-1 truncate text-sm text-ink">{item.merchant}</span>
                <RestoreRecurringButton merchantKey={item.merchantKey} direction={item.direction} />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

function SeriesCard({
  title,
  description,
  series,
}: {
  title: string;
  description?: string;
  series: RecurringSeries[];
}) {
  return (
    <Card>
      <CardHeader title={title} description={description} />
      <ul className="divide-y divide-hairline pb-1">
        {series.map((item) => (
          <li key={item.key}>
            <SeriesRow series={item} />
          </li>
        ))}
      </ul>
    </Card>
  );
}

function SeriesRow({ series }: { series: RecurringSeries }) {
  const signed = (amount: number) => (series.direction === "out" ? -amount : amount);
  const history = [...series.occurrences].reverse();

  return (
    <details className="group">
      <summary className="flex list-none items-center gap-3 px-5 py-3 transition-colors hover:bg-wash/60 [&::-webkit-details-marker]:hidden">
        <CategoryIcon name={series.categoryIcon} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">{series.merchant}</p>
          <p className="truncate text-[13px] text-ink-3">
            {CADENCE_LABEL[series.cadence]} · last {formatDayMonth(series.lastDate)}
            {series.active ? ` · next around ${formatDayMonth(series.nextDate)}` : ""}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm tabular">
            {series.variable ? <span className="text-ink-3">≈ </span> : null}
            <FlowAmount cents={signed(series.amount)} />
          </p>
          {series.cadence !== "monthly" || series.variable ? (
            <p className="text-[13px] text-ink-3 tabular">
              <Money cents={series.monthlyAmount} /> / month
            </p>
          ) : null}
        </div>
        <ChevronDown
          aria-hidden
          className="size-4 shrink-0 text-ink-3 transition-transform group-open:rotate-180"
        />
      </summary>

      <div className="px-5 pt-1 pb-4 sm:pl-[4.25rem]">
        <p className="flex items-center gap-1.5 text-[13px] text-ink-2">
          <CalendarClock aria-hidden className="size-3.5 text-ink-3" />
          {evidenceLabel(series)}
          {series.variable ? " · the amount varies" : ""}
        </p>
        <table className="mt-3 w-full max-w-sm text-[13px]">
          <caption className="sr-only">Payments so far</caption>
          <tbody>
            {history.slice(0, 12).map((occurrence) => (
              <tr key={occurrence.id} className="border-b border-hairline last:border-0">
                <td className="py-1.5 text-ink-2">{formatDate(occurrence.date)}</td>
                <td className="py-1.5 text-right">
                  <FlowAmount cents={signed(occurrence.amount)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {history.length > 12 ? (
          <p className="mt-1 text-xs text-ink-3">and {history.length - 12} earlier</p>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href={href("/transactions", { merchant: series.merchantKey })}
            className={buttonClass({ size: "sm" })}
          >
            Show transactions
          </Link>
          {series.evidence === "confirmed" ? (
            <RestoreRecurringButton
              merchantKey={series.merchantKey}
              direction={series.direction}
              label="Unmark"
            />
          ) : (
            <IgnoreRecurringButton
              merchantKey={series.merchantKey}
              direction={series.direction}
              merchant={series.merchant}
            />
          )}
        </div>
      </div>
    </details>
  );
}
