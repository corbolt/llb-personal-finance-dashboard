"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { defaultLocale, isLocale } from "@/i18n/config";
import { i18nFor } from "@/i18n/languages";
import type { MessageError } from "@/i18n/messages";
import { getDb } from "@/server/db";
import { UserFacingError } from "@/server/errors";
import { deleteImport, ingestExport, type IngestResult } from "@/server/import/ingest";
import * as mutations from "@/server/mutations";

/**
 * Server Actions — every change the UI can make goes through here.
 *
 * Actions are plain HTTP endpoints, so each one validates its input even
 * though the app's own components always send well-formed values.
 *
 * A failure is reported as a message key (`error.*`), not as text: an action
 * does not know which language its caller is showing, and the caller does.
 * Components turn it into words with `t.error()`.
 */

export type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: MessageError };

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

function failure(error: unknown): { ok: false; error: MessageError } {
  if (error instanceof UserFacingError) {
    return { ok: false, error: { key: error.key, params: error.params } };
  }
  if (error instanceof z.ZodError) {
    return { ok: false, error: { key: "error.invalidRequest" } };
  }
  console.error(error);
  return { ok: false, error: { key: "error.unexpected" } };
}

/** Runs a mutation, then re-renders the current page with fresh data. */
function mutate<T>(work: () => T): ActionResult<T> {
  try {
    const data = work();
    refresh();
    return { ok: true, data };
  } catch (error) {
    return failure(error);
  }
}

const id = z.number().int().positive();
const direction = z.enum(["out", "in"]);
const cadence = z.enum(["weekly", "biweekly", "monthly", "quarterly", "semiannual", "yearly"]);
const categoryKind = z.enum(["expense", "income", "transfer"]);

/* ------------------------------------------------------------------ */
/* Import                                                              */
/* ------------------------------------------------------------------ */

export interface ImportedFile {
  filename: string;
  result?: IngestResult;
  error?: MessageError;
}

export type ImportState = { files: ImportedFile[] } | null;

/**
 * Imports one or more uploaded export files. Used with `useActionState`.
 *
 * The form says which language it is shown in (`locale`): the first import
 * creates the account, and its name is stored in that language.
 */
export async function importExports(_previous: ImportState, formData: FormData): Promise<ImportState> {
  const uploads = formData.getAll("file").filter((entry): entry is File => entry instanceof File && entry.size > 0);
  if (uploads.length === 0) {
    return { files: [{ filename: "", error: { key: "error.noFile" } }] };
  }

  const accountField = formData.get("accountId");
  const accountId =
    typeof accountField === "string" && /^\d+$/.test(accountField) ? Number(accountField) : undefined;

  const localeField = formData.get("locale");
  const { t } = i18nFor(isLocale(localeField) ? localeField : defaultLocale);
  const accountNames = {
    main: t("account.main"),
    named: (name: string) => t("account.named", { name }),
  };

  const db = getDb();
  const files: ImportedFile[] = [];
  for (const upload of uploads) {
    if (upload.size > MAX_UPLOAD_BYTES) {
      files.push({ filename: upload.name, error: { key: "error.fileTooLarge" } });
      continue;
    }
    try {
      const data = new Uint8Array(await upload.arrayBuffer());
      files.push({
        filename: upload.name,
        result: ingestExport(db, { filename: upload.name, data, accountId, accountNames }),
      });
    } catch (error) {
      files.push({ filename: upload.name, error: failure(error).error });
    }
  }
  refresh();
  return { files };
}

export async function removeImport(importId: number): Promise<ActionResult<number>> {
  return mutate(() => deleteImport(getDb(), id.parse(importId)));
}

/* ------------------------------------------------------------------ */
/* Transactions                                                        */
/* ------------------------------------------------------------------ */

export async function setCategory(
  transactionId: number,
  categoryId: number | null,
  scope: "one" | "merchant",
): Promise<ActionResult<mutations.CategoryChange>> {
  return mutate(() =>
    mutations.setTransactionCategory(
      getDb(),
      id.parse(transactionId),
      id.nullable().parse(categoryId),
      z.enum(["one", "merchant"]).parse(scope),
    ),
  );
}

export async function setMerchantCategory(
  merchantKey: string,
  categoryId: number,
): Promise<ActionResult<mutations.CategoryChange>> {
  return mutate(() =>
    mutations.setMerchantCategory(getDb(), z.string().min(1).parse(merchantKey), id.parse(categoryId)),
  );
}

export async function setNote(transactionId: number, note: string): Promise<ActionResult> {
  return mutate(() => {
    mutations.setTransactionNote(getDb(), id.parse(transactionId), z.string().max(2000).parse(note));
    return null;
  });
}

export async function setExcluded(transactionId: number, excluded: boolean): Promise<ActionResult> {
  return mutate(() => {
    mutations.setTransactionExcluded(getDb(), id.parse(transactionId), z.boolean().parse(excluded));
    return null;
  });
}

/* ------------------------------------------------------------------ */
/* Categories and rules                                                */
/* ------------------------------------------------------------------ */

const categoryInput = z.object({
  name: z.string(),
  kind: categoryKind,
  icon: z.string().min(1).max(40),
});

export async function createCategory(input: mutations.CategoryInput): Promise<ActionResult<number>> {
  return mutate(() => mutations.createCategory(getDb(), categoryInput.parse(input)));
}

export async function updateCategory(
  categoryId: number,
  input: mutations.CategoryInput,
): Promise<ActionResult> {
  return mutate(() => {
    mutations.updateCategory(getDb(), id.parse(categoryId), categoryInput.parse(input));
    return null;
  });
}

export async function deleteCategory(categoryId: number): Promise<ActionResult> {
  return mutate(() => {
    mutations.deleteCategory(getDb(), id.parse(categoryId));
    return null;
  });
}

export async function createTextRule(text: string, categoryId: number): Promise<ActionResult<number>> {
  return mutate(() =>
    mutations.createTextRule(getDb(), z.string().max(200).parse(text), id.parse(categoryId)),
  );
}

export async function deleteRule(ruleId: number): Promise<ActionResult<number>> {
  return mutate(() => mutations.deleteRule(getDb(), id.parse(ruleId)));
}

export async function reapplyRules(): Promise<ActionResult<number>> {
  return mutate(() => mutations.recategoriseAll(getDb()));
}

/* ------------------------------------------------------------------ */
/* Budgets                                                             */
/* ------------------------------------------------------------------ */

/** @param amount monthly budget in minor units; `null` removes the budget */
export async function setBudget(categoryId: number, amount: number | null): Promise<ActionResult> {
  return mutate(() => {
    mutations.setBudget(
      getDb(),
      id.parse(categoryId),
      z.number().int().min(0).max(100_000_000_00).nullable().parse(amount),
    );
    return null;
  });
}

/* ------------------------------------------------------------------ */
/* Accounts                                                            */
/* ------------------------------------------------------------------ */

export async function createAccount(name: string): Promise<ActionResult<number>> {
  return mutate(() => mutations.createAccount(getDb(), z.string().max(200).parse(name)));
}

export async function renameAccount(accountId: number, name: string): Promise<ActionResult> {
  return mutate(() => {
    mutations.renameAccount(getDb(), id.parse(accountId), z.string().max(200).parse(name));
    return null;
  });
}

export async function deleteAccount(accountId: number): Promise<ActionResult> {
  return mutate(() => {
    mutations.deleteEmptyAccount(getDb(), id.parse(accountId));
    return null;
  });
}

/* ------------------------------------------------------------------ */
/* Recurring payments                                                  */
/* ------------------------------------------------------------------ */

const merchantKey = z.string().min(1).max(200);

export async function ignoreRecurring(key: string, dir: "out" | "in"): Promise<ActionResult> {
  return mutate(() => {
    mutations.ignoreRecurring(getDb(), merchantKey.parse(key), direction.parse(dir));
    return null;
  });
}

export async function markRecurring(
  key: string,
  dir: "out" | "in",
  every: z.infer<typeof cadence>,
): Promise<ActionResult> {
  return mutate(() => {
    mutations.forceRecurring(getDb(), merchantKey.parse(key), direction.parse(dir), cadence.parse(every));
    return null;
  });
}

export async function resetRecurring(key: string, dir: "out" | "in"): Promise<ActionResult> {
  return mutate(() => {
    mutations.clearRecurringOverride(getDb(), merchantKey.parse(key), direction.parse(dir));
    return null;
  });
}
