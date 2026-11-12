"use client";

import { CircleAlert, CircleCheck, FileSpreadsheet, LoaderCircle, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useRef, useState, type DragEvent } from "react";
import { toast } from "sonner";

import { importExports, type ImportedFile, type ImportState } from "@/app/actions";
import { buttonClass } from "@/components/ui/button";
import { Label, NativeSelect } from "@/components/ui/field";
import type { I18n } from "@/i18n";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/cn";

/**
 * Upload area for bank exports. Files are imported as soon as they are
 * chosen or dropped; the outcome of each file is listed underneath.
 */
export function ImportForm({
  accounts,
  compact = false,
}: {
  accounts: Array<{ id: number; name: string }>;
  /** Smaller drop area, for use inside other pages. */
  compact?: boolean;
}) {
  const i18n = useI18n();
  const { t, locale } = i18n;
  const router = useRouter();
  const [state, action, pending] = useActionState<ImportState, FormData>(async (previous, formData) => {
    const next = await importExports(previous, formData);
    // On the welcome screen a successful import replaces this form with the
    // dashboard, so the outcome is announced where it survives that.
    if (compact && next) announce(next.files, i18n, (path) => router.push(path));
    return next;
  }, null);
  const [dragging, setDragging] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const input = useRef<HTMLInputElement>(null);

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    if (pending || !input.current || event.dataTransfer.files.length === 0) return;
    input.current.files = event.dataTransfer.files;
    form.current?.requestSubmit();
  }

  return (
    <div className="space-y-3">
      <form ref={form} action={action} className="space-y-3">
        {/* the first import names the account it creates — in this language */}
        <input type="hidden" name="locale" value={locale} />
        {accounts.length > 1 ? (
          <div className="flex items-center gap-3">
            <Label htmlFor="import-account">{t("import.into")}</Label>
            <NativeSelect id="import-account" name="accountId" defaultValue={accounts[0].id}>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </NativeSelect>
          </div>
        ) : null}

        <label
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-6 text-center transition-colors focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/30",
            compact ? "py-8" : "py-12",
            dragging ? "border-accent bg-accent/5" : "border-axis bg-surface hover:bg-wash/50",
            pending && "pointer-events-none opacity-70",
          )}
        >
          <span className="grid size-11 place-items-center rounded-xl bg-wash text-ink-2">
            {pending ? (
              <LoaderCircle aria-hidden className="size-5 animate-spin" />
            ) : (
              <Upload aria-hidden className="size-5" strokeWidth={1.75} />
            )}
          </span>
          <span className="mt-4 text-sm font-medium text-ink">
            {pending ? t("import.importing") : t("import.drop")}
          </span>
          <span className="mt-1 text-[13px] text-ink-2">
            {t.rich("import.dropHint", {
              link: (content) => <span className="text-accent underline-offset-2 hover:underline">{content}</span>,
            })}
          </span>
          <input
            ref={input}
            type="file"
            name="file"
            multiple
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            disabled={pending}
            onChange={(event) => {
              if (event.target.files && event.target.files.length > 0) form.current?.requestSubmit();
            }}
          />
        </label>
      </form>

      {state ? (
        <ul className="space-y-2" aria-live="polite">
          {state.files.map((file, index) => (
            <FileResult key={`${file.filename}-${index}`} file={file} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Summarises an import as toasts. */
function announce(files: ImportedFile[], { t, link }: I18n, navigate: (path: string) => void) {
  for (const file of files) {
    const { result } = file;
    if (!result) {
      toast.error(file.filename ? t("import.failed", { filename: file.filename }) : t("import.nothingImported"), {
        description: file.error ? t.error(file.error) : undefined,
      });
    } else if (result.inserted === 0) {
      toast(t("import.nothingNewIn", { filename: file.filename }), {
        description: t("import.allKnown", { count: result.rowCount }),
      });
    } else {
      toast.success(
        t("import.imported", { count: result.inserted }),
        result.uncategorised > 0
          ? {
              description: t("import.needCategory", { count: result.uncategorised }),
              action: { label: t("import.review"), onClick: () => navigate(link("/categories#review")) },
              duration: 12_000,
            }
          : undefined,
      );
    }
  }
}

function FileResult({ file }: { file: ImportedFile }) {
  const { t, format, link } = useI18n();
  const { result } = file;

  if (!result) {
    return (
      <li className="flex items-start gap-3 rounded-xl border border-line bg-surface px-4 py-3">
        <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-critical-ink" />
        <div className="min-w-0 text-sm">
          {file.filename ? <p className="truncate font-medium text-ink">{file.filename}</p> : null}
          <p className="text-ink-2">{file.error ? t.error(file.error) : null}</p>
        </div>
      </li>
    );
  }

  const nothingNew = result.inserted === 0;
  // "12 new transactions added to Main account, 3 already there · 1 Oct 2026 – 31 Oct 2026"
  const added = [
    t("import.added", { count: result.inserted, account: result.accountName }),
    result.duplicates > 0 ? t("import.alreadyThere", { count: result.duplicates }) : null,
  ];
  const summary = [
    added.filter(Boolean).join(", "),
    result.dateFrom && result.dateTo ? `${format.date(result.dateFrom)} – ${format.date(result.dateTo)}` : null,
  ];
  const skippedRows = result.skipped.slice(0, 5).map((row) => row.rowNumber);

  return (
    <li className="flex items-start gap-3 rounded-xl border border-line bg-surface px-4 py-3">
      {nothingNew ? (
        <FileSpreadsheet aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-3" />
      ) : (
        <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-positive" />
      )}
      <div className="min-w-0 flex-1 text-sm">
        <p className="truncate font-medium text-ink">{file.filename}</p>
        <p className="text-ink-2">
          {nothingNew ? t("import.nothingNew", { count: result.rowCount }) : summary.filter(Boolean).join(" · ")}
        </p>
        {result.planned > 0 ? (
          <p className="text-[13px] text-ink-3">{t("import.plannedLeftOut", { count: result.planned })}</p>
        ) : null}
        {result.skipped.length > 0 ? (
          <p className="text-[13px] text-ink-3">
            {t("import.skippedRows", {
              count: result.skipped.length,
              rows: `${skippedRows.join(", ")}${result.skipped.length > 5 ? ", …" : ""}`,
            })}
          </p>
        ) : null}
        {result.fileOrder === "unverified" && !nothingNew ? (
          <p className="text-[13px] text-ink-3">{t("import.unverifiedOrder")}</p>
        ) : null}
        {!nothingNew ? (
          <div className="mt-2.5 flex flex-wrap gap-2">
            {result.uncategorised > 0 ? (
              <Link href={link("/categories#review")} className={buttonClass({ variant: "primary", size: "sm" })}>
                {t("import.reviewUncategorised", { count: result.uncategorised })}
              </Link>
            ) : null}
            <Link href={link("/transactions")} className={buttonClass({ size: "sm" })}>
              {t("import.viewTransactions")}
            </Link>
          </div>
        ) : null}
      </div>
    </li>
  );
}
