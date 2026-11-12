import { PartyPopper } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";

import { CategoryManager } from "@/components/categories/category-manager";
import { ReviewList } from "@/components/categories/review-list";
import { RulesManager } from "@/components/categories/rules-manager";
import { PageHeader, PageSkeleton } from "@/components/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { categoryName, merchantName, withCategoryName, withMerchantName } from "@/i18n/names";
import { getI18n } from "@/i18n/server";
import { requestDb } from "@/server/db/request";
import { listCategories, listCategoriesWithUsage, listRules } from "@/server/queries/categories";
import { getUncategorisedMerchants } from "@/server/queries/transactions";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("nav.categories") };
}

export default async function CategoriesPage() {
  const { t } = await getI18n();
  return (
    <>
      <PageHeader title={t("nav.categories")} description={t("categories.description")} />
      <Suspense fallback={<PageSkeleton label={t("common.loading")} />}>
        <Categories />
      </Suspense>
    </>
  );
}

async function Categories() {
  const db = await requestDb();
  const { t } = await getI18n();
  // stored names become the names to show before anything is rendered
  const merchants = getUncategorisedMerchants(db).map((merchant) => withMerchantName(t, merchant));
  const usage = listCategoriesWithUsage(db).map((category) => withCategoryName(t, category));
  const categories = listCategories(db).map((category) => withCategoryName(t, category));
  const rules = listRules(db).map((rule) => ({
    ...rule,
    merchant:
      rule.merchant === null ? null : merchantName(t, { merchant: rule.merchant, merchantKey: rule.pattern }),
    categoryName: categoryName(t, { name: rule.categoryName, slug: rule.categorySlug }),
  }));
  const openTransactions = merchants.reduce((sum, merchant) => sum + merchant.count, 0);

  return (
    <div className="space-y-4">
      <Card id="review" className="scroll-mt-6">
        <CardHeader
          title={t("categories.needsCategory")}
          description={
            merchants.length > 0
              ? t("categories.needsCategoryText", {
                  transactions: t("count.transactions", { count: openTransactions }),
                  merchants: t("categories.fromMerchants", { count: merchants.length }),
                })
              : undefined
          }
        />
        {merchants.length > 0 ? (
          <ReviewList merchants={merchants} categories={categories} />
        ) : (
          <CardBody>
            <p className="flex items-center gap-2 text-sm text-ink-2">
              <PartyPopper aria-hidden className="size-4 text-ink-3" />
              {t("categories.allCategorised")}
            </p>
          </CardBody>
        )}
      </Card>

      <Card>
        <CardHeader title={t("nav.categories")} description={t("categories.listDescription")} />
        <CategoryManager categories={usage} />
      </Card>

      <Card>
        <CardHeader title={t("rules.title")} description={t("rules.description")} />
        <RulesManager rules={rules} categories={categories} />
      </Card>
    </div>
  );
}
