"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { removeImport } from "@/app/actions";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { useI18n } from "@/i18n/client";
import type { ImportRecord } from "@/server/queries/accounts";

export function ImportHistory({
  imports,
  showAccount,
}: {
  imports: ImportRecord[];
  showAccount: boolean;
}) {
  const { t, format } = useI18n();
  const [pending, startTransition] = useTransition();

  function remove(record: ImportRecord) {
    startTransition(async () => {
      const result = await removeImport(record.id);
      if (result.ok) toast.success(t("history.removed", { count: result.data, filename: record.filename }));
      else toast.error(t.error(result.error));
    });
  }

  /** `Imported 11 Nov 2026 into Savings · covers 1 Oct 2026 – 31 Oct 2026` */
  function summary(record: ImportRecord): string {
    // `2026-11-11 12:06:37` (UTC, as SQLite stores it) → the day
    const date = format.date(record.importedAt.slice(0, 10));
    const parts = [
      showAccount
        ? t("history.importedInto", { date, account: record.accountName })
        : t("history.imported", { date }),
    ];
    if (record.dateFrom && record.dateTo) {
      parts.push(t("history.covers", { from: format.date(record.dateFrom), to: format.date(record.dateTo) }));
    }
    return parts.join(" · ");
  }

  return (
    <ul className="divide-y divide-hairline">
      {imports.map((record) => (
        <li key={record.id} className="flex items-center gap-4 px-5 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">{record.filename}</p>
            <p className="text-[13px] text-ink-3">{summary(record)}</p>
          </div>
          <p className="hidden text-right text-[13px] text-ink-2 sm:block">
            {t("import.addedCount", { count: record.insertedCount })}
            {record.duplicateCount > 0 ? (
              <span className="block text-ink-3">
                {t("import.alreadyThere", { count: record.duplicateCount })}
              </span>
            ) : null}
          </p>
          <ConfirmButton
            size="sm"
            variant="ghost"
            disabled={pending}
            confirmLabel={t("history.confirmRemove", { count: record.remaining })}
            onConfirm={() => remove(record)}
          >
            {t("common.remove")}
          </ConfirmButton>
        </li>
      ))}
    </ul>
  );
}
