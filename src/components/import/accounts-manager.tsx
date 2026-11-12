"use client";

import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { createAccount, deleteAccount, renameAccount, type ActionResult } from "@/app/actions";
import { Money } from "@/components/money";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Input } from "@/components/ui/field";
import { useI18n } from "@/i18n/client";
import type { AccountSummary } from "@/server/queries/accounts";

export function AccountsManager({ accounts }: { accounts: AccountSummary[] }) {
  const { t, format } = useI18n();
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(work: () => Promise<ActionResult<unknown>>, done: string) {
    startTransition(async () => {
      const result = await work();
      if (!result.ok) {
        toast.error(t.error(result.error));
        return;
      }
      toast.success(done);
      setEditing(null);
    });
  }

  function save() {
    if (editing === "new") submit(() => createAccount(name), t("accounts.added"));
    else if (editing !== null) submit(() => renameAccount(editing, name), t("accounts.renamed"));
  }

  const editor = (
    <form
      className="flex flex-1 items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <Input
        autoFocus
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder={t("accounts.name")}
        aria-label={t("accounts.name")}
        maxLength={60}
        className="h-8 flex-1"
      />
      <Button type="submit" size="icon" variant="primary" disabled={pending} aria-label={t("common.save")}>
        <Check aria-hidden className="size-4" />
      </Button>
      <Button size="icon" variant="ghost" onClick={() => setEditing(null)} aria-label={t("common.cancel")}>
        <X aria-hidden className="size-4" />
      </Button>
    </form>
  );

  return (
    <div>
      <ul className="divide-y divide-hairline">
        {accounts.map((account) => (
          <li key={account.id} className="flex min-h-14 items-center gap-4 px-5 py-2.5">
            {editing === account.id ? (
              editor
            ) : (
              <>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{account.name}</p>
                  <p className="text-[13px] text-ink-3">
                    {account.transactionCount === 0
                      ? t("accounts.noTransactions")
                      : t("accounts.summary", {
                          count: account.transactionCount,
                          from: format.date(account.firstDate!),
                          to: format.date(account.lastDate!),
                        })}
                  </p>
                </div>
                {account.balance !== null ? (
                  <div className="text-right">
                    <Money cents={account.balance} currency={account.currency} className="text-sm font-medium text-ink tabular" />
                    <p className="text-[13px] text-ink-3">
                      {t("accounts.balanceOn", { date: format.date(account.balanceDate!) })}
                    </p>
                  </div>
                ) : null}
                <div className="flex items-center gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={t("accounts.rename", { name: account.name })}
                    onClick={() => {
                      setName(account.name);
                      setEditing(account.id);
                    }}
                  >
                    <Pencil aria-hidden className="size-3.5" />
                  </Button>
                  {account.transactionCount === 0 ? (
                    <ConfirmButton
                      size="sm"
                      variant="ghost"
                      confirmLabel={t("common.confirmDelete")}
                      disabled={pending}
                      onConfirm={() => submit(() => deleteAccount(account.id), t("accounts.deleted"))}
                    >
                      <Trash2 aria-hidden className="size-3.5" />
                      <span className="sr-only">{t("accounts.delete", { name: account.name })}</span>
                    </ConfirmButton>
                  ) : null}
                </div>
              </>
            )}
          </li>
        ))}
        {editing === "new" ? <li className="flex min-h-14 items-center px-5 py-2.5">{editor}</li> : null}
      </ul>
      {editing !== "new" ? (
        <div className="border-t border-hairline px-5 py-3">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setName("");
              setEditing("new");
            }}
          >
            <Plus aria-hidden className="size-4" />
            {t("accounts.addAnother")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
