import { TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";

import { AccountsManager } from "@/components/import/accounts-manager";
import { ImportForm } from "@/components/import/import-form";
import { ImportHistory } from "@/components/import/import-history";
import { PageHeader, PageSkeleton } from "@/components/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { requestDb } from "@/server/db/request";
import { findBalanceGaps, listAccounts, listImports } from "@/server/queries/accounts";

export const metadata: Metadata = { title: "Import" };

export default function ImportPage() {
  return (
    <>
      <PageHeader
        title="Import"
        description="Upload the export from your online banking. Anything already imported is skipped, so overlapping exports are fine."
      />
      <Suspense fallback={<PageSkeleton />}>
        <ImportContent />
      </Suspense>
    </>
  );
}

async function ImportContent() {
  const db = await requestDb();
  const accounts = listAccounts(db);
  const imports = listImports(db);
  const gaps = findBalanceGaps(db);

  return (
    <div className="space-y-6">
      <ImportForm accounts={accounts.map(({ id, name }) => ({ id, name }))} />

      {gaps.length > 0 ? (
        <Card className="border-warning/60">
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <TriangleAlert aria-hidden className="size-4 text-serious" />
                Some transactions seem to be missing
              </span>
            }
            description="The running balance jumps between these dates, so bookings in between were never imported. Export that period again to fill the gap."
          />
          <CardBody>
            <ul className="space-y-1.5 text-sm text-ink-2">
              {gaps.map((gap) => (
                <li key={`${gap.accountId}-${gap.afterDate}-${gap.beforeDate}`}>
                  <span className="text-ink">
                    {formatDate(gap.afterDate)} – {formatDate(gap.beforeDate)}
                  </span>
                  {accounts.length > 1 ? ` · ${gap.accountName}` : ""} · unexplained{" "}
                  {formatMoney(gap.missingAmount, "CHF", { sign: "always" })}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      {accounts.length > 0 ? (
        <Card>
          <CardHeader title="Accounts" description="Each export belongs to one account." />
          <AccountsManager accounts={accounts} />
        </Card>
      ) : null}

      {imports.length > 0 ? (
        <Card>
          <CardHeader
            title="Import history"
            description="Removing an import deletes the transactions it added, including their categories and notes."
          />
          <ImportHistory imports={imports} showAccount={accounts.length > 1} />
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Getting a good export" />
        <CardBody>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink-2">
            <li>
              Export the account&rsquo;s transactions from your online banking as Excel (.xlsx).
              The columns <em>Buchungsdatum</em>, <em>Buchungstext</em> and <em>Betrag</em> are
              required; <em>Referenz-Nr.</em> and <em>Saldo</em> make duplicates and balances exact.
            </li>
            <li>
              An export only contains the transactions listed on screen, and that list can be capped
              (for example at 200 rows). If more happened between two imports, widen the list or
              the date range before exporting. A gap is reported here if one slips through.
            </li>
            <li>
              Don&rsquo;t sort or filter the list before exporting; the bank&rsquo;s own order is
              what keeps balances exact.
            </li>
            <li>Everything stays on this computer, in a single SQLite file.</li>
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
