"use client";

import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";

import { setMerchantCategory } from "@/app/actions";
import { CategorySelect, type CategoryOption } from "@/components/category-select";
import { FlowAmount } from "@/components/money";
import { formatDayMonth } from "@/lib/dates";
import { href } from "@/lib/url";
import type { UncategorisedMerchant } from "@/server/queries/transactions";

/**
 * Merchants whose bookings have no category. Choosing one categorises all of
 * the merchant's bookings and creates the rule for future imports.
 */
export function ReviewList({
  merchants,
  categories,
}: {
  merchants: UncategorisedMerchant[];
  categories: CategoryOption[];
}) {
  const [pending, startTransition] = useTransition();

  function assign(merchant: UncategorisedMerchant, categoryId: number | null) {
    if (categoryId === null) return;
    startTransition(async () => {
      const result = await setMerchantCategory(merchant.merchantKey, categoryId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const category = categories.find((item) => item.id === categoryId)?.name ?? "";
      toast.success(`${merchant.merchant} → ${category}`, {
        description: `${result.data.updated} ${result.data.updated === 1 ? "transaction" : "transactions"} categorised. Future imports follow.`,
      });
    });
  }

  return (
    <ul className="divide-y divide-hairline pb-1">
      {merchants.map((merchant) => (
        <li
          key={merchant.merchantKey}
          className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-5 py-3 sm:grid-cols-[minmax(0,1fr)_6.5rem_14rem]"
        >
          <div className="min-w-0">
            <Link
              href={href("/transactions", { merchant: merchant.merchantKey })}
              className="truncate text-sm font-medium text-ink hover:underline"
            >
              {merchant.merchant}
            </Link>
            <p className="truncate text-[13px] text-ink-3">
              {merchant.count} {merchant.count === 1 ? "transaction" : "transactions"} · last{" "}
              {formatDayMonth(merchant.lastDate)}
              {merchant.memo ?? merchant.location ? ` · ${merchant.memo ?? merchant.location}` : ""}
            </p>
          </div>
          <FlowAmount cents={merchant.total} className="text-right text-sm" />
          <div className="col-span-2 sm:col-span-1">
            <CategorySelect
              categories={categories}
              value={null}
              onChange={(categoryId) => assign(merchant, categoryId)}
              allowNone={false}
              placeholder="Choose a category"
              disabled={pending}
              label={`Category for ${merchant.merchant}`}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
