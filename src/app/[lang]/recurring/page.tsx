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
import type { Translator } from "@/i18n";
import { withMerchantName } from "@/i18n/names";
import { getI18n } from "@/i18n/server";
import { addDays, todayIso } from "@/lib/dates";
import { requestDb } from "@/server/db/request";
import { getRecurring, listIgnoredRecurring, upcomingCharges } from "@/server/queries/recurring";
import type { RecurringSeries } from "@/server/recurring/detect";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("nav.recurring") };
}

export default async function RecurringPage() {
  const { t } = await getI18n();
  return (
    <>
      <PageHeader title={t("nav.recurring")} description={t("recurring.description")} />
      <Suspense fallback={<PageSkeleton label={t("common.loading")} />}>
        <Recurring />
      </Suspense>
    </>
  );
}

function evidenceLabel(t: Translator, series: RecurringSeries): string {
  switch (series.evidence) {
    case "confirmed":
      return t("recurring.evidence.confirmed");
    case "pattern":
      return series.variable ? t("recurring.evidence.everyMonth") : t("recurring.evidence.pattern");
    case "period":
      return t("recurring.evidence.period");
    case "known":
      return t("recurring.evidence.known");
    case "keyword":
      return t("recurring.evidence.keyword");
  }
}

async function Recurring() {
  const db = await requestDb();
  const { t, format, link } = await getI18n();
  const detected = getRecurring(db);
  const { dataThrough } = detected;
  // stored merchant names become the names to show before anything is rendered
  const series = detected.series.map((item) => withMerchantName(t, item));
  const ignored = listIgnoredRecurring(db).map((item) => withMerchantName(t, item));

  if (!dataThrough) {
    return (
      <Card>
        <EmptyState
          icon={Repeat}
          title={t("recurring.nothingYet")}
          action={
            <Link href={link("/import")} className={buttonClass({ variant: "primary" })}>
              {t("common.importExport")}
            </Link>
          }
        >
          {t("recurring.nothingYetText")}
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
        <StatTile label={t("recurring.fixedPerMonth")} detail={t("recurring.billsCount", { count: costs.length })}>
          <Figure cents={monthlyCosts} />
        </StatTile>
        <StatTile label={t("recurring.fixedPerYear")}>
          <Figure cents={monthlyCosts * 12} />
        </StatTile>
        <StatTile label={t("recurring.incomePerMonth")}>
          <Figure cents={monthlyIncome} />
        </StatTile>
        <StatTile label={t("recurring.leftAfter")} detail={t("recurring.leftAfterDetail")}>
          <Figure cents={monthlyIncome - monthlyCosts} />
        </StatTile>
      </div>

      {series.length === 0 ? (
        <Card>
          <EmptyState icon={Repeat} title={t("recurring.noneFound")}>
            {t("recurring.noneFoundText")}
          </EmptyState>
        </Card>
      ) : null}

      {upcoming.length > 0 ? (
        <Card>
          <CardHeader
            title={t("recurring.next30")}
            description={t("recurring.next30Description", { date: format.date(today) })}
          />
          <ul className="divide-y divide-hairline pb-2">
            {upcoming.map(({ series: item, date }) => (
              <li key={`${item.key}-${date}`} className="flex items-center gap-3 px-5 py-2.5">
                <span className="w-16 shrink-0 text-[13px] text-ink-2 tabular">{format.dayMonth(date)}</span>
                <CategoryIcon name={item.categoryIcon} size="sm" />
                <span className="min-w-0 flex-1 truncate text-sm text-ink">{item.merchant}</span>
                <span className="hidden text-[13px] text-ink-3 sm:inline">{format.relativeDay(date, today)}</span>
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
        <SeriesCard title={t("recurring.bills")} description={t("recurring.billsDescription")} series={costs} />
      ) : null}
      {income.length > 0 ? <SeriesCard title={t("recurring.income")} series={income} /> : null}
      {inactive.length > 0 ? (
        <SeriesCard
          title={t("recurring.ended")}
          description={t("recurring.endedDescription", { date: format.date(dataThrough) })}
          series={inactive}
        />
      ) : null}

      {ignored.length > 0 ? (
        <Card>
          <CardHeader title={t("recurring.ignored")} />
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

/** One recurring payment; `series.merchant` is already the name to show. */
async function SeriesRow({ series }: { series: RecurringSeries }) {
  const { t, format, link } = await getI18n();
  const signed = (amount: number) => (series.direction === "out" ? -amount : amount);
  const history = [...series.occurrences].reverse();
  const rhythm = [
    t(`cadence.${series.cadence}`),
    t("recurring.last", { date: format.dayMonth(series.lastDate) }),
    series.active ? t("recurring.nextAround", { date: format.dayMonth(series.nextDate) }) : null,
  ];
  const evidence = [evidenceLabel(t, series), series.variable ? t("recurring.amountVaries") : null];

  return (
    <details className="group">
      <summary className="flex list-none items-center gap-3 px-5 py-3 transition-colors hover:bg-wash/60 [&::-webkit-details-marker]:hidden">
        <CategoryIcon name={series.categoryIcon} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">{series.merchant}</p>
          <p className="truncate text-[13px] text-ink-3">{rhythm.filter(Boolean).join(" · ")}</p>
        </div>
        <div className="text-right">
          <p className="text-sm tabular">
            {series.variable ? <span className="text-ink-3">≈ </span> : null}
            <FlowAmount cents={signed(series.amount)} />
          </p>
          {series.cadence !== "monthly" || series.variable ? (
            <p className="text-[13px] text-ink-3 tabular">
              {t.rich("recurring.perMonth", { amount: <Money cents={series.monthlyAmount} /> })}
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
          {evidence.filter(Boolean).join(" · ")}
        </p>
        <table className="mt-3 w-full max-w-sm text-[13px]">
          <caption className="sr-only">{t("recurring.paymentsSoFar")}</caption>
          <tbody>
            {history.slice(0, 12).map((occurrence) => (
              <tr key={occurrence.id} className="border-b border-hairline last:border-0">
                <td className="py-1.5 text-ink-2">{format.date(occurrence.date)}</td>
                <td className="py-1.5 text-right">
                  <FlowAmount cents={signed(occurrence.amount)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {history.length > 12 ? (
          <p className="mt-1 text-xs text-ink-3">{t("recurring.andEarlier", { count: history.length - 12 })}</p>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href={link("/transactions", { merchant: series.merchantKey })}
            className={buttonClass({ size: "sm" })}
          >
            {t("recurring.showTransactions")}
          </Link>
          {series.evidence === "confirmed" ? (
            <RestoreRecurringButton
              merchantKey={series.merchantKey}
              direction={series.direction}
              label={t("recurring.unmark")}
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
