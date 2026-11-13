"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { NativeSelect } from "@/components/ui/field";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/cn";
import type { QueryValue } from "@/lib/url";

/**
 * Picks the account a page looks at. The choice lives in the URL as
 * `account`, next to the page's other search params.
 */
export function AccountSelect({
  accounts,
  value,
  path,
  query = {},
  className,
}: {
  accounts: Array<{ id: number; name: string }>;
  /** The selected account's id, or `""` for all accounts. */
  value: string;
  /** The page to stay on, without the language: `/spending`. */
  path: string;
  /** Other search params to keep when switching. */
  query?: Record<string, QueryValue>;
  className?: string;
}) {
  const { t, link } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <NativeSelect
      className={cn("max-w-48 shrink-0", pending && "opacity-60", className)}
      aria-label={t("common.account")}
      aria-busy={pending}
      value={value}
      onChange={(event) => {
        const account = event.target.value;
        startTransition(() => {
          router.replace(link(path, { ...query, account }), { scroll: false });
        });
      }}
    >
      <option value="">{t("transactions.allAccounts")}</option>
      {accounts.map((account) => (
        <option key={account.id} value={account.id}>
          {account.name}
        </option>
      ))}
    </NativeSelect>
  );
}
