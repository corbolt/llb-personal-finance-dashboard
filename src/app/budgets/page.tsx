import { CircleAlert, CircleCheck, Target, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { BudgetEditor } from "@/components/budgets/budget-editor";
import { CategoryIcon } from "@/components/category-icon";
import { Meter, type MeterTone } from "@/components/charts/meter";
import { Figure, Money } from "@/components/money";
import { EmptyState, MonthSwitcher, PageHeader, PageSkeleton } from "@/components/page";
import { buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { formatDate, formatMonth, formatMonthName, monthEnd } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { monthBounds, resolveMonth } from "@/lib/period";
import { href, param } from "@/lib/url";
import { requestDb } from "@/server/db/request";
import { getDataRange } from "@/server/queries/accounts";
import { getBudgetOverview, type BudgetLine } from "@/server/queries/budgets";

export const metadata: Metadata = { title: "Budgets" };

/** From this share of a budget on, the meter turns to "almost used". */
const NEARLY_USED = 0.85;

export default function BudgetsPage(props: PageProps<"/budgets">) {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title="Budgets" />
          <PageSkeleton />
        </>
      }
    >
      <Budgets searchParams={props.searchParams} />
    </Suspense>
  );
}

interface Status {
  tone: MeterTone;
  label: string;
  icon: typeof CircleCheck;
}

function statusOf(spent: number, budget: number): Status {
  if (spent > budget) {
    return { tone: "critical", label: `Over by ${formatMoney(spent - budget)}`, icon: TriangleAlert };
  }
  const left = `${formatMoney(budget - spent)} left`;
  return budget > 0 && spent / budget >= NEARLY_USED
    ? { tone: "warning", label: `${left} · almost used`, icon: CircleAlert }
    : { tone: "accent", label: left, icon: CircleCheck };
}

/** Rounds a suggestion up to a friendly figure: 10s below 500, 50s above. */
function friendly(amount: number): number {
  const step = amount < 50_000 ? 1_000 : 5_000;
  return Math.ceil(amount / step) * step;
}

async function Budgets({ searchParams }: Pick<PageProps<"/budgets">, "searchParams">) {
  const query = await searchParams;
  const db = await requestDb();
  const range = getDataRange(db);

  if (!range.firstDate || !range.lastDate || !range.coveredThrough) {
    return (
      <>
        <PageHeader title="Budgets" />
        <Card>
          <EmptyState
            icon={Target}
            title="Budgets need transactions"
            action={
              <Link href="/import" className={buttonClass({ variant: "primary" })}>
                Import a bank export
              </Link>
            }
          >
            Import your transactions first; budgets are then suggested from what you usually spend.
          </EmptyState>
        </Card>
      </>
    );
  }

  const bounds = monthBounds(range.firstDate, range.lastDate);
  const month = resolveMonth(param(query.m), bounds);
  const overview = getBudgetOverview(db, month);
  const running = range.coveredThrough < monthEnd(month);
  const summary = statusOf(overview.spentOnBudgeted, overview.totalBudget);
  const SummaryIcon = summary.icon;

  return (
    <>
      <PageHeader
        title="Budgets"
        description={
          running
            ? `${formatMonth(month)} so far — data through ${formatDate(range.coveredThrough)}`
            : "A monthly limit per spending category"
        }
      >
        <MonthSwitcher month={month} min={bounds.min} max={bounds.max} path="/budgets" />
      </PageHeader>

      <div className="space-y-4">
        {overview.budgeted.length === 0 ? (
          <Card>
            <EmptyState icon={Target} title="No budgets yet">
              Pick the categories you want to keep an eye on below and give each a monthly limit.
              The suggestions come from your own average.
            </EmptyState>
          </Card>
        ) : (
          <>
            <Card>
              <CardBody className="pt-5">
                <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
                  <div>
                    <p className="text-[13px] text-ink-2">
                      Spent in budgeted categories in {formatMonthName(month)}
                    </p>
                    <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2">
                      <Figure cents={overview.spentOnBudgeted} />
                      <span className="text-sm text-ink-2">
                        of <Money cents={overview.totalBudget} className="text-ink" /> budgeted
                      </span>
                    </p>
                  </div>
                  <p className="flex items-center gap-1.5 text-sm text-ink-2">
                    <SummaryIcon aria-hidden className="size-4" />
                    {summary.label}
                  </p>
                </div>
                <Meter
                  className="mt-4"
                  value={overview.spentOnBudgeted}
                  limit={overview.totalBudget}
                  tone={summary.tone}
                  label={`All budgets: ${formatMoney(overview.spentOnBudgeted)} of ${formatMoney(overview.totalBudget)}`}
                />
                {overview.totalSpent - overview.spentOnBudgeted > 0 ? (
                  <p className="mt-3 text-[13px] text-ink-3">
                    Another <Money cents={overview.totalSpent - overview.spentOnBudgeted} /> went to
                    categories without a budget.
                  </p>
                ) : null}
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="By category" />
              <ul className="divide-y divide-hairline pb-1">
                {overview.budgeted.map((line) => (
                  <li key={line.categoryId}>
                    <BudgetRow line={line} month={month} />
                  </li>
                ))}
              </ul>
            </Card>
          </>
        )}

        {overview.unbudgeted.length > 0 ? (
          <Card>
            <CardHeader
              title="Without a budget"
              description="Categories you spend in — the suggested limit is your recent monthly average, rounded up"
            />
            <ul className="divide-y divide-hairline pb-1">
              {overview.unbudgeted.map((line) => (
                <li key={line.categoryId} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-2.5">
                  <CategoryIcon name={line.icon} />
                  <div className="min-w-0 flex-1">
                    <Link
                      href={href("/transactions", { m: month, category: line.categoryId })}
                      className="truncate text-sm font-medium text-ink hover:underline"
                    >
                      {line.name}
                    </Link>
                    <p className="text-[13px] text-ink-3 tabular">
                      <Money cents={line.spent} /> this month
                      {line.average !== null ? (
                        <>
                          {" "}
                          · <Money cents={line.average} /> on average
                        </>
                      ) : null}
                    </p>
                  </div>
                  <BudgetEditor
                    categoryId={line.categoryId}
                    categoryName={line.name}
                    budget={null}
                    suggestion={friendly(Math.max(line.average ?? 0, line.spent))}
                  />
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>
    </>
  );
}

function BudgetRow({ line, month }: { line: BudgetLine; month: string }) {
  const budget = line.budget ?? 0;
  const status = statusOf(line.spent, budget);
  const Icon = status.icon;
  return (
    <div className="px-5 py-3.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <CategoryIcon name={line.icon} />
        <div className="min-w-0 flex-1">
          <Link
            href={href("/transactions", { m: month, category: line.categoryId })}
            className="truncate text-sm font-medium text-ink hover:underline"
          >
            {line.name}
          </Link>
          <p className="text-[13px] text-ink-2 tabular">
            <Money cents={line.spent} className="text-ink" /> of <Money cents={budget} />
          </p>
        </div>
        <BudgetEditor categoryId={line.categoryId} categoryName={line.name} budget={line.budget} />
      </div>
      <Meter
        className="mt-3"
        value={line.spent}
        limit={budget}
        tone={status.tone}
        label={`${line.name}: ${formatMoney(line.spent)} of ${formatMoney(budget)}`}
      />
      <p className="mt-2 flex items-center gap-1.5 text-[13px] text-ink-2">
        <Icon aria-hidden className="size-3.5" />
        {status.label}
      </p>
    </div>
  );
}
