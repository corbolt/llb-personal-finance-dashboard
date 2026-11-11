"use client";

import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { createAccount, deleteAccount, renameAccount, type ActionResult } from "@/app/actions";
import { Money } from "@/components/money";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Input } from "@/components/ui/field";
import { formatDate } from "@/lib/dates";
import type { AccountSummary } from "@/server/queries/accounts";

export function AccountsManager({ accounts }: { accounts: AccountSummary[] }) {
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(work: () => Promise<ActionResult<unknown>>, done: string) {
    startTransition(async () => {
      const result = await work();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(done);
      setEditing(null);
    });
  }

  function save() {
    if (editing === "new") submit(() => createAccount(name), "Account added");
    else if (editing !== null) submit(() => renameAccount(editing, name), "Account renamed");
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
        placeholder="Account name"
        aria-label="Account name"
        maxLength={60}
        className="h-8 flex-1"
      />
      <Button type="submit" size="icon" variant="primary" disabled={pending} aria-label="Save">
        <Check aria-hidden className="size-4" />
      </Button>
      <Button size="icon" variant="ghost" onClick={() => setEditing(null)} aria-label="Cancel">
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
                      ? "No transactions yet"
                      : `${account.transactionCount} transactions · ${formatDate(account.firstDate!)} – ${formatDate(account.lastDate!)}`}
                  </p>
                </div>
                {account.balance !== null ? (
                  <div className="text-right">
                    <Money cents={account.balance} currency={account.currency} className="text-sm font-medium text-ink tabular" />
                    <p className="text-[13px] text-ink-3">
                      balance on {formatDate(account.balanceDate!)}
                    </p>
                  </div>
                ) : null}
                <div className="flex items-center gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Rename ${account.name}`}
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
                      confirmLabel="Delete?"
                      disabled={pending}
                      onConfirm={() => submit(() => deleteAccount(account.id), "Account deleted")}
                    >
                      <Trash2 aria-hidden className="size-3.5" />
                      <span className="sr-only">Delete {account.name}</span>
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
            Add another account
          </Button>
        </div>
      ) : null}
    </div>
  );
}
