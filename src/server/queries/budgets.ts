import { monthEnd, monthStart, type IsoMonth } from "../../lib/dates";
import type { Db } from "../db/database";
import { getDataRange } from "./accounts";
import { getAverageSpendingByCategory } from "./flows";

export interface BudgetLine {
  categoryId: number;
  name: string;
  slug: string | null;
  icon: string;
  /** Monthly budget, or `null` if none is set. */
  budget: number | null;
  /** Net spending in the month. */
  spent: number;
  /** Average monthly spending over the preceding complete months, if there are any. */
  average: number | null;
}

export interface BudgetOverview {
  month: IsoMonth;
  /** Spending categories with a budget, in display order. */
  budgeted: BudgetLine[];
  /** Spending categories without a budget that saw spending recently. */
  unbudgeted: BudgetLine[];
  totalBudget: number;
  /** Spending within budgeted categories. */
  spentOnBudgeted: number;
  /** All spending in the month, uncategorised bookings included. */
  totalSpent: number;
}

export function getBudgetOverview(db: Db, month: IsoMonth): BudgetOverview {
  const from = monthStart(month);
  const to = monthEnd(month);
  const range = getDataRange(db);
  const averages =
    range.firstDate && range.coveredThrough
      ? getAverageSpendingByCategory(db, month, { from: range.firstDate, to: range.coveredThrough })
      : new Map<number, number>();

  const rows = db.all<{
    categoryId: number;
    name: string;
    slug: string | null;
    icon: string;
    budget: number | null;
    spent: number | null;
  }>(
    `SELECT
       c.id AS categoryId, c.name, c.slug, c.icon, b.amount AS budget,
       (SELECT -SUM(t.amount) FROM transactions t
        WHERE t.category_id = c.id AND t.excluded = 0 AND t.date BETWEEN :from AND :to) AS spent
     FROM categories c
     LEFT JOIN budgets b ON b.category_id = c.id
     WHERE c.kind = 'expense'
     ORDER BY c.sort_order, c.name`,
    { from, to },
  );

  const lines: BudgetLine[] = rows.map((row) => ({
    categoryId: row.categoryId,
    name: row.name,
    slug: row.slug,
    icon: row.icon,
    budget: row.budget,
    spent: row.spent ?? 0,
    average: averages.get(row.categoryId) ?? null,
  }));

  const budgeted = lines.filter((line) => line.budget !== null);
  const unbudgeted = lines
    .filter((line) => line.budget === null && (line.spent !== 0 || line.average !== null))
    .sort((a, b) => b.spent - a.spent || (b.average ?? 0) - (a.average ?? 0));

  const total = db.get<{ spent: number | null }>(
    `SELECT -SUM(amount) AS spent FROM transactions_view
     WHERE excluded = 0 AND flow = 'expense' AND date BETWEEN ? AND ?`,
    [from, to],
  );

  return {
    month,
    budgeted,
    unbudgeted,
    totalBudget: budgeted.reduce((sum, line) => sum + (line.budget ?? 0), 0),
    spentOnBudgeted: budgeted.reduce((sum, line) => sum + line.spent, 0),
    totalSpent: total?.spent ?? 0,
  };
}
