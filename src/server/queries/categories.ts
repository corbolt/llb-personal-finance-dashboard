import type { Db } from "../db/database";
import type { CategoryKind } from "../db/default-categories";

export interface Category {
  id: number;
  slug: string | null;
  name: string;
  kind: CategoryKind;
  icon: string;
}

const KIND_ORDER = "CASE kind WHEN 'expense' THEN 0 WHEN 'income' THEN 1 ELSE 2 END";

export function listCategories(db: Db): Category[] {
  return db.all<Category>(
    `SELECT id, slug, name, kind, icon FROM categories
     ORDER BY ${KIND_ORDER}, sort_order, name`,
  );
}

export interface CategoryUsage extends Category {
  transactionCount: number;
  ruleCount: number;
}

export function listCategoriesWithUsage(db: Db): CategoryUsage[] {
  return db.all<CategoryUsage>(
    `SELECT
       c.id, c.slug, c.name, c.kind, c.icon,
       (SELECT COUNT(*) FROM transactions t WHERE t.category_id = c.id) AS transactionCount,
       (SELECT COUNT(*) FROM rules r WHERE r.category_id = c.id) AS ruleCount
     FROM categories c
     ORDER BY ${KIND_ORDER}, c.sort_order, c.name`,
  );
}

export interface Rule {
  id: number;
  matchType: "merchant" | "text";
  pattern: string;
  /** Merchant display name for merchant rules, when bookings of it exist. */
  merchant: string | null;
  categoryId: number;
  categoryName: string;
  categorySlug: string | null;
  categoryIcon: string;
  /** Bookings of the merchant this rule categorises; `null` for text rules. */
  matchCount: number | null;
}

export function listRules(db: Db): Rule[] {
  return db.all<Rule>(
    `SELECT
       r.id, r.match_type AS matchType, r.pattern,
       CASE WHEN r.match_type = 'merchant' THEN
         (SELECT MAX(t.merchant) FROM transactions t WHERE t.merchant_key = r.pattern)
       END AS merchant,
       r.category_id AS categoryId, c.name AS categoryName, c.slug AS categorySlug,
       c.icon AS categoryIcon,
       CASE WHEN r.match_type = 'merchant' THEN
         (SELECT COUNT(*) FROM transactions t WHERE t.merchant_key = r.pattern)
       END AS matchCount
     FROM rules r
     JOIN categories c ON c.id = r.category_id
     ORDER BY COALESCE(merchant, r.pattern) COLLATE NOCASE`,
  );
}
