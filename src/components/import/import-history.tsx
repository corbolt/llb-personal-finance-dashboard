"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { removeImport } from "@/app/actions";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { formatDate } from "@/lib/dates";
import type { ImportRecord } from "@/server/queries/accounts";

/** `2026-11-11 12:06:37` (UTC, as SQLite stores it) → `11 Nov 2026`. */
function importedOn(timestamp: string): string {
  return formatDate(timestamp.slice(0, 10));
}

export function ImportHistory({
  imports,
  showAccount,
}: {
  imports: ImportRecord[];
  showAccount: boolean;
}) {
  const [pending, startTransition] = useTransition();

  function remove(record: ImportRecord) {
    startTransition(async () => {
      const result = await removeImport(record.id);
      if (result.ok) toast.success(`Removed ${result.data} transactions from ${record.filename}`);
      else toast.error(result.error);
    });
  }

  return (
    <ul className="divide-y divide-hairline">
      {imports.map((record) => (
        <li key={record.id} className="flex items-center gap-4 px-5 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">{record.filename}</p>
            <p className="text-[13px] text-ink-3">
              Imported {importedOn(record.importedAt)}
              {showAccount ? ` into ${record.accountName}` : ""}
              {record.dateFrom && record.dateTo
                ? ` · covers ${formatDate(record.dateFrom)} – ${formatDate(record.dateTo)}`
                : ""}
            </p>
          </div>
          <p className="hidden text-right text-[13px] text-ink-2 sm:block">
            {record.insertedCount} added
            {record.duplicateCount > 0 ? (
              <span className="block text-ink-3">{record.duplicateCount} already there</span>
            ) : null}
          </p>
          <ConfirmButton
            size="sm"
            variant="ghost"
            disabled={pending}
            confirmLabel={`Remove ${record.remaining} transactions?`}
            onConfirm={() => remove(record)}
          >
            Remove
          </ConfirmButton>
        </li>
      ))}
    </ul>
  );
}
