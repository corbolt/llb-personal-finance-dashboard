import { PartyPopper } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";

import { CategoryManager } from "@/components/categories/category-manager";
import { ReviewList } from "@/components/categories/review-list";
import { RulesManager } from "@/components/categories/rules-manager";
import { PageHeader, PageSkeleton } from "@/components/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { requestDb } from "@/server/db/request";
import { listCategories, listCategoriesWithUsage, listRules } from "@/server/queries/categories";
import { getUncategorisedMerchants } from "@/server/queries/transactions";

export const metadata: Metadata = { title: "Categories" };

export default function CategoriesPage() {
  return (
    <>
      <PageHeader
        title="Categories"
        description="How transactions are sorted — and the rules that do it for you"
      />
      <Suspense fallback={<PageSkeleton />}>
        <Categories />
      </Suspense>
    </>
  );
}

async function Categories() {
  const db = await requestDb();
  const merchants = getUncategorisedMerchants(db);
  const usage = listCategoriesWithUsage(db);
  const categories = listCategories(db);
  const rules = listRules(db);
  const openTransactions = merchants.reduce((sum, merchant) => sum + merchant.count, 0);

  return (
    <div className="space-y-4">
      <Card id="review" className="scroll-mt-6">
        <CardHeader
          title="Needs a category"
          description={
            merchants.length > 0
              ? `${openTransactions} ${openTransactions === 1 ? "transaction" : "transactions"} from ${merchants.length} ${merchants.length === 1 ? "merchant" : "merchants"}. Pick a category once per merchant — it applies to all of its transactions and to future imports.`
              : undefined
          }
        />
        {merchants.length > 0 ? (
          <ReviewList merchants={merchants} categories={categories} />
        ) : (
          <CardBody>
            <p className="flex items-center gap-2 text-sm text-ink-2">
              <PartyPopper aria-hidden className="size-4 text-ink-3" />
              Everything is categorised.
            </p>
          </CardBody>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Categories"
          description="The number is how many transactions each one holds. Hover a category to edit it."
        />
        <CategoryManager categories={usage} />
      </Card>

      <Card>
        <CardHeader title="Rules" description="Your own rules come first, then the built-in recognition of known merchants" />
        <RulesManager rules={rules} categories={categories} />
      </Card>
    </div>
  );
}
