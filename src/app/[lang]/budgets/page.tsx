import { CircleAlert, CircleCheck, Target, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { BudgetEditor } from "@/components/budgets/budget-editor";
import { CategoryIcon } from "@/components/category-icon";
import { Meter, type MeterTone } from "@/components/charts/meter";
import { Figure, Money } from "@/components/money";
import { MonthSwitcher } from "@/components/month-switcher";
import { EmptyState, PageHeader, PageSkeleton } from "@/components/page";
import { buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import type { Translator } from "@/i18n";
import { categoryName } from "@/i18n/names";
import { getI18n } from "@/i18n/server";
import { monthEnd } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { monthBounds, resolveMonth } from "@/lib/period";
import { param } from "@/lib/url";
import { requestDb } from "@/server/db/request";
import { getDataRange } from "@/server/queries/accounts";
import { getBudgetOverview, type BudgetLine } from "@/server/queries/budgets";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("nav.budgets") };
}

/** From this share of a budget on, the meter turns to "almost used". */
const NEARLY_USED = 0.85;

export default async function BudgetsPage(props: PageProps<"/[lang]/budgets">) {
  const { t } = await getI18n();
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title={t("nav.budgets")} />
          <PageSkeleton label={t("common.loading")} />
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

function statusOf(t: Translator, spent: number, budget: number): Status {
  if (spent > budget) {
    return {
      tone: "critical",
      label: t("budgets.over", { amount: formatMoney(spent - budget) }),
      icon: TriangleAlert,
    };
  }
  const amount = formatMoney(budget - spent);
  return budget > 0 && spent / budget >= NEARLY_USED
    ? { tone: "warning", label: t("budgets.leftAlmostUsed", { amount }), icon: CircleAlert }
    : { tone: "accent", label: t("budgets.left", { amount }), icon: CircleCheck };
}

/** Rounds a suggestion up to a friendly figure: 10s below 500, 50s above. */
function friendly(amount: number): number {
  const step = amount < 50_000 ? 1_000 : 5_000;
  return Math.ceil(amount / step) * step;
}

async function Budgets({ searchParams }: Pick<PageProps<"/[lang]/budgets">, "searchParams">) {
  const query = await searchParams;
  const db = await requestDb();
  const { t, format, link } = await getI18n();
  const range = getDataRange(db);

  if (!range.firstDate || !range.lastDate || !range.coveredThrough) {
    return (
      <>
        <PageHeader title={t("nav.budgets")} />
        <Card>
          <EmptyState
            icon={Target}
            title={t("budgets.needTransactions")}
            action={
              <Link href={link("/import")} className={buttonClass({ variant: "primary" })}>
                {t("common.importExport")}
              </Link>
            }
          >
            {t("budgets.needTransactionsText")}
          </EmptyState>
        </Card>
      </>
    );
  }

  const bounds = monthBounds(range.firstDate, range.lastDate);
  const month = resolveMonth(param(query.m), bounds);
  const overview = getBudgetOverview(db, month);
  // from here on a line's name is the one to show
  const named = (line: BudgetLine): BudgetLine => ({ ...line, name: categoryName(t, line) });
  const budgeted = overview.budgeted.map(named);
  const unbudgeted = overview.unbudgeted.map(named);
  const running = range.coveredThrough < monthEnd(month);
  const summary = statusOf(t, overview.spentOnBudgeted, overview.totalBudget);
  const SummaryIcon = summary.icon;

  return (
    <>
      <PageHeader
        title={t("nav.budgets")}
        description={
          running
            ? t("budgets.soFar", { month: format.month(month), date: format.date(range.coveredThrough) })
            : t("budgets.description")
        }
      >
        <MonthSwitcher month={month} min={bounds.min} max={bounds.max} path="/budgets" />
      </PageHeader>

      <div className="space-y-4">
        {budgeted.length === 0 ? (
          <Card>
            <EmptyState icon={Target} title={t("budgets.none")}>
              {t("budgets.noneText")}
            </EmptyState>
          </Card>
        ) : (
          <>
            <Card>
              <CardBody className="pt-5">
                <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
                  <div>
                    <p className="text-[13px] text-ink-2">
                      {t("budgets.spentIn", { month: format.monthName(month) })}
                    </p>
                    <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2">
                      <Figure cents={overview.spentOnBudgeted} />
                      <span className="text-sm text-ink-2">
                        {t.rich("budgets.ofBudgeted", {
                          amount: <Money cents={overview.totalBudget} className="text-ink" />,
                        })}
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
                  label={t("budgets.allBudgets", {
                    spent: formatMoney(overview.spentOnBudgeted),
                    budget: formatMoney(overview.totalBudget),
                  })}
                />
                {overview.totalSpent - overview.spentOnBudgeted > 0 ? (
                  <p className="mt-3 text-[13px] text-ink-3">
                    {t.rich("budgets.elsewhere", {
                      amount: <Money cents={overview.totalSpent - overview.spentOnBudgeted} />,
                    })}
                  </p>
                ) : null}
              </CardBody>
            </Card>

            <Card>
              <CardHeader title={t("common.byCategory")} />
              <ul className="divide-y divide-hairline pb-1">
                {budgeted.map((line) => (
                  <li key={line.categoryId}>
                    <BudgetRow line={line} month={month} />
                  </li>
                ))}
              </ul>
            </Card>
          </>
        )}

        {unbudgeted.length > 0 ? (
          <Card>
            <CardHeader title={t("budgets.without")} description={t("budgets.withoutDescription")} />
            <ul className="divide-y divide-hairline pb-1">
              {unbudgeted.map((line) => (
                <li key={line.categoryId} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-2.5">
                  <CategoryIcon name={line.icon} />
                  <div className="min-w-0 flex-1">
                    <Link
                      href={link("/transactions", { m: month, category: line.categoryId })}
                      className="truncate text-sm font-medium text-ink hover:underline"
                    >
                      {line.name}
                    </Link>
                    <p className="text-[13px] text-ink-3 tabular">
                      {line.average !== null
                        ? t.rich("budgets.thisMonthAverage", {
                            amount: <Money cents={line.spent} />,
                            average: <Money cents={line.average} />,
                          })
                        : t.rich("budgets.thisMonth", { amount: <Money cents={line.spent} /> })}
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

/** One budgeted category; `line.name` is already the name to show. */
async function BudgetRow({ line, month }: { line: BudgetLine; month: string }) {
  const { t, link } = await getI18n();
  const budget = line.budget ?? 0;
  const status = statusOf(t, line.spent, budget);
  const Icon = status.icon;
  return (
    <div className="px-5 py-3.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <CategoryIcon name={line.icon} />
        <div className="min-w-0 flex-1">
          <Link
            href={link("/transactions", { m: month, category: line.categoryId })}
            className="truncate text-sm font-medium text-ink hover:underline"
          >
            {line.name}
          </Link>
          <p className="text-[13px] text-ink-2 tabular">
            {t.rich("budgets.spentOf", {
              spent: <Money cents={line.spent} className="text-ink" />,
              budget: <Money cents={budget} />,
            })}
          </p>
        </div>
        <BudgetEditor categoryId={line.categoryId} categoryName={line.name} budget={line.budget} />
      </div>
      <Meter
        className="mt-3"
        value={line.spent}
        limit={budget}
        tone={status.tone}
        label={t("budgets.meter", {
          category: line.name,
          spent: formatMoney(line.spent),
          budget: formatMoney(budget),
        })}
      />
      <p className="mt-2 flex items-center gap-1.5 text-[13px] text-ink-2">
        <Icon aria-hidden className="size-3.5" />
        {status.label}
      </p>
    </div>
  );
}
