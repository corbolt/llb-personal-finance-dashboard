import { TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";

import { AccountsManager } from "@/components/import/accounts-manager";
import { ImportForm } from "@/components/import/import-form";
import { ImportHistory } from "@/components/import/import-history";
import { PageHeader, PageSkeleton } from "@/components/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { getI18n } from "@/i18n/server";
import { formatMoney } from "@/lib/money";
import { requestDb } from "@/server/db/request";
import { findBalanceGaps, listAccounts, listImports } from "@/server/queries/accounts";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("nav.import") };
}

export default async function ImportPage() {
  const { t } = await getI18n();
  return (
    <>
      <PageHeader title={t("nav.import")} description={t("import.description")} />
      <Suspense fallback={<PageSkeleton label={t("common.loading")} />}>
        <ImportContent />
      </Suspense>
    </>
  );
}

async function ImportContent() {
  const db = await requestDb();
  const { t, format } = await getI18n();
  const accounts = listAccounts(db);
  const imports = listImports(db);
  const gaps = findBalanceGaps(db);
  // column names as the bank prints them, whatever the interface language
  const em = (content: ReactNode) => <em>{content}</em>;

  return (
    <div className="space-y-6">
      <ImportForm accounts={accounts.map(({ id, name }) => ({ id, name }))} />

      {gaps.length > 0 ? (
        <Card className="border-warning/60">
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <TriangleAlert aria-hidden className="size-4 text-serious" />
                {t("import.gaps.title")}
              </span>
            }
            description={t("import.gaps.description")}
          />
          <CardBody>
            <ul className="space-y-1.5 text-sm text-ink-2">
              {gaps.map((gap) => (
                <li key={`${gap.accountId}-${gap.afterDate}-${gap.beforeDate}`}>
                  <span className="text-ink">
                    {format.date(gap.afterDate)} – {format.date(gap.beforeDate)}
                  </span>
                  {accounts.length > 1 ? ` · ${gap.accountName}` : ""} ·{" "}
                  {t("import.gaps.unexplained", {
                    amount: formatMoney(gap.missingAmount, "CHF", { sign: "always" }),
                  })}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      {accounts.length > 0 ? (
        <Card>
          <CardHeader title={t("accounts.title")} description={t("accounts.description")} />
          <AccountsManager accounts={accounts} />
        </Card>
      ) : null}

      {imports.length > 0 ? (
        <Card>
          <CardHeader title={t("history.title")} description={t("history.description")} />
          <ImportHistory imports={imports} showAccount={accounts.length > 1} />
        </Card>
      ) : null}

      <Card>
        <CardHeader title={t("import.tips.title")} />
        <CardBody>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink-2">
            <li>{t.rich("import.tips.columns", { em })}</li>
            <li>{t("import.tips.capped")}</li>
            <li>{t("import.tips.order")}</li>
            <li>{t("import.tips.local")}</li>
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
