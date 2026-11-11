"use client";

import { CircleAlert, CircleCheck, FileSpreadsheet, LoaderCircle, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useRef, useState, type DragEvent } from "react";
import { toast } from "sonner";

import { importExports, type ImportedFile, type ImportState } from "@/app/actions";
import { buttonClass } from "@/components/ui/button";
import { Label, NativeSelect } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/dates";

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
  const router = useRouter();
  const [state, action, pending] = useActionState<ImportState, FormData>(async (previous, formData) => {
    const next = await importExports(previous, formData);
    // On the welcome screen a successful import replaces this form with the
    // dashboard, so the outcome is announced where it survives that.
    if (compact && next) announce(next.files, (path) => router.push(path));
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
        {accounts.length > 1 ? (
          <div className="flex items-center gap-3">
            <Label htmlFor="import-account">Import into</Label>
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
            {pending ? "Importing…" : "Drop your bank export here"}
          </span>
          <span className="mt-1 text-[13px] text-ink-2">
            or <span className="text-accent underline-offset-2 hover:underline">choose a file</span> —
            .xlsx from your online banking, several at once is fine
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
function announce(files: ImportedFile[], navigate: (path: string) => void) {
  for (const file of files) {
    const { result } = file;
    if (!result) {
      toast.error(file.filename ? `${file.filename} could not be imported` : "Nothing imported", {
        description: file.error,
      });
    } else if (result.inserted === 0) {
      toast(`Nothing new in ${file.filename}`, {
        description: `All ${result.rowCount} transactions were already imported.`,
      });
    } else {
      toast.success(
        `${result.inserted} ${result.inserted === 1 ? "transaction" : "transactions"} imported`,
        result.uncategorised > 0
          ? {
              description: `${result.uncategorised} of them still need a category.`,
              action: { label: "Review", onClick: () => navigate("/categories#review") },
              duration: 12_000,
            }
          : undefined,
      );
    }
  }
}

function FileResult({ file }: { file: ImportedFile }) {
  const { result } = file;

  if (!result) {
    return (
      <li className="flex items-start gap-3 rounded-xl border border-line bg-surface px-4 py-3">
        <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-critical-ink" />
        <div className="min-w-0 text-sm">
          {file.filename ? <p className="truncate font-medium text-ink">{file.filename}</p> : null}
          <p className="text-ink-2">{file.error}</p>
        </div>
      </li>
    );
  }

  const nothingNew = result.inserted === 0;
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
          {nothingNew
            ? `Nothing new — all ${result.rowCount} transactions were already imported.`
            : `${result.inserted} new ${result.inserted === 1 ? "transaction" : "transactions"} added to ${result.accountName}`}
          {!nothingNew && result.duplicates > 0 ? `, ${result.duplicates} already there` : ""}
          {!nothingNew && result.dateFrom && result.dateTo
            ? ` · ${formatDate(result.dateFrom)} – ${formatDate(result.dateTo)}`
            : ""}
        </p>
        {result.planned > 0 ? (
          <p className="text-[13px] text-ink-3">
            {result.planned} planned (not yet booked) {result.planned === 1 ? "entry was" : "entries were"} left out.
          </p>
        ) : null}
        {result.skipped.length > 0 ? (
          <p className="text-[13px] text-ink-3">
            {result.skipped.length} {result.skipped.length === 1 ? "row" : "rows"} could not be read (row{" "}
            {result.skipped
              .slice(0, 5)
              .map((row) => row.rowNumber)
              .join(", ")}
            {result.skipped.length > 5 ? ", …" : ""}).
          </p>
        ) : null}
        {result.fileOrder === "unverified" && !nothingNew ? (
          <p className="text-[13px] text-ink-3">
            The running balance in this file does not add up row by row — it may be filtered or sorted
            differently. Balances shown for this period can be off.
          </p>
        ) : null}
        {!nothingNew ? (
          <div className="mt-2.5 flex flex-wrap gap-2">
            {result.uncategorised > 0 ? (
              <Link href="/categories#review" className={buttonClass({ variant: "primary", size: "sm" })}>
                Review {result.uncategorised} uncategorised
              </Link>
            ) : null}
            <Link href="/transactions" className={buttonClass({ size: "sm" })}>
              View transactions
            </Link>
          </div>
        ) : null}
      </div>
    </li>
  );
}
