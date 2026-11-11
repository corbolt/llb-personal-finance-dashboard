import type { Db } from "./database";

export type CategoryKind = "expense" | "income" | "transfer";

export interface DefaultCategory {
  slug: string;
  name: string;
  kind: CategoryKind;
  /** Name of an icon in the category icon registry. */
  icon: string;
}

/**
 * Built-in categories. The slug is the stable handle that the automatic
 * categoriser refers to; names and icons can be changed freely by the user.
 */
export const DEFAULT_CATEGORIES: DefaultCategory[] = [
  { slug: "groceries", name: "Groceries", kind: "expense", icon: "ShoppingBasket" },
  { slug: "dining", name: "Dining & Drinks", kind: "expense", icon: "Utensils" },
  { slug: "shopping", name: "Shopping", kind: "expense", icon: "ShoppingBag" },
  { slug: "home", name: "Home & Garden", kind: "expense", icon: "Sofa" },
  { slug: "housing", name: "Housing", kind: "expense", icon: "House" },
  { slug: "utilities", name: "Bills & Utilities", kind: "expense", icon: "Zap" },
  { slug: "insurance", name: "Insurance", kind: "expense", icon: "ShieldCheck" },
  { slug: "health", name: "Health & Wellness", kind: "expense", icon: "HeartPulse" },
  { slug: "personal-care", name: "Personal Care", kind: "expense", icon: "Scissors" },
  { slug: "transport", name: "Auto & Transport", kind: "expense", icon: "Car" },
  { slug: "travel", name: "Travel", kind: "expense", icon: "Plane" },
  { slug: "entertainment", name: "Entertainment", kind: "expense", icon: "Clapperboard" },
  { slug: "software", name: "Software & Tech", kind: "expense", icon: "Monitor" },
  { slug: "kids", name: "Kids & Family", kind: "expense", icon: "Baby" },
  { slug: "education", name: "Education", kind: "expense", icon: "GraduationCap" },
  { slug: "pets", name: "Pets", kind: "expense", icon: "PawPrint" },
  { slug: "gifts", name: "Gifts & Donations", kind: "expense", icon: "Gift" },
  { slug: "taxes", name: "Taxes & Government", kind: "expense", icon: "Landmark" },
  { slug: "fees", name: "Fees & Charges", kind: "expense", icon: "Receipt" },
  { slug: "credit-card", name: "Credit Card Payments", kind: "expense", icon: "CreditCard" },
  { slug: "cash", name: "Cash Withdrawals", kind: "expense", icon: "Banknote" },
  { slug: "other", name: "Other", kind: "expense", icon: "CircleHelp" },

  { slug: "salary", name: "Salary", kind: "income", icon: "Briefcase" },
  { slug: "benefits", name: "Benefits & Allowances", kind: "income", icon: "HandCoins" },
  { slug: "refunds", name: "Refunds & Reimbursements", kind: "income", icon: "Undo2" },
  { slug: "interest", name: "Interest & Dividends", kind: "income", icon: "TrendingUp" },
  { slug: "other-income", name: "Other Income", kind: "income", icon: "Coins" },

  { slug: "transfer", name: "Internal Transfers", kind: "transfer", icon: "ArrowLeftRight" },
  { slug: "savings", name: "Savings & Investments", kind: "transfer", icon: "PiggyBank" },
];

/** Inserts the built-in categories into a fresh database. */
export function seedDefaultCategories(db: Db): void {
  const existing = db.get<{ n: number }>("SELECT COUNT(*) AS n FROM categories");
  if (existing && existing.n > 0) return;
  db.transaction(() => {
    DEFAULT_CATEGORIES.forEach((category, index) => {
      db.run(
        `INSERT INTO categories (slug, name, kind, icon, sort_order)
         VALUES (:slug, :name, :kind, :icon, :sort_order)`,
        { ...category, sort_order: index },
      );
    });
  });
}
