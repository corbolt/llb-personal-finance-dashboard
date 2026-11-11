"use client";

import { RotateCcw, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { createTextRule, deleteRule, reapplyRules } from "@/app/actions";
import { CategoryGlyph } from "@/components/category-icon";
import { CategorySelect, type CategoryOption } from "@/components/category-select";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Input } from "@/components/ui/field";
import type { Rule } from "@/server/queries/categories";

const changed = (count: number) =>
  count === 0 ? "No transaction changed" : `${count} ${count === 1 ? "transaction" : "transactions"} recategorised`;

export function RulesManager({ rules, categories }: { rules: Rule[]; categories: CategoryOption[] }) {
  const [text, setText] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  function add() {
    if (categoryId === null) return;
    startTransition(async () => {
      const result = await createTextRule(text, categoryId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Rule added", { description: changed(result.data) });
      setText("");
      setCategoryId(null);
    });
  }

  function remove(rule: Rule) {
    startTransition(async () => {
      const result = await deleteRule(rule.id);
      if (result.ok) toast.success("Rule deleted", { description: changed(result.data) });
      else toast.error(result.error);
    });
  }

  function reapply() {
    startTransition(async () => {
      const result = await reapplyRules();
      if (result.ok) toast.success(changed(result.data));
      else toast.error(result.error);
    });
  }

  return (
    <div>
      {rules.length === 0 ? (
        <p className="px-5 pb-4 text-sm text-ink-2">
          No rules yet. One is created whenever you categorise all transactions of a merchant.
        </p>
      ) : (
        <ul className="divide-y divide-hairline border-b border-hairline">
          {rules.map((rule) => (
            <li key={rule.id} className="flex items-center gap-3 px-5 py-2.5">
              <p className="min-w-0 flex-1 truncate text-sm text-ink-2">
                {rule.matchType === "merchant" ? (
                  <>
                    Merchant is <span className="font-medium text-ink">{rule.merchant ?? rule.pattern}</span>
                  </>
                ) : (
                  <>
                    Statement text contains <span className="font-medium text-ink">“{rule.pattern}”</span>
                  </>
                )}
              </p>
              <span className="flex shrink-0 items-center gap-1.5 text-sm text-ink">
                <span aria-hidden className="text-ink-3">
                  →
                </span>
                <CategoryGlyph name={rule.categoryIcon} className="text-ink-2" />
                {rule.categoryName}
              </span>
              {rule.matchCount !== null ? (
                <span className="hidden w-10 text-right text-[13px] text-ink-3 tabular sm:block">{rule.matchCount}×</span>
              ) : (
                <span className="hidden w-10 sm:block" />
              )}
              <ConfirmButton
                size="sm"
                variant="ghost"
                confirmLabel="Delete?"
                disabled={pending}
                onConfirm={() => remove(rule)}
              >
                <Trash2 aria-hidden className="size-3.5" />
                <span className="sr-only">Delete rule</span>
              </ConfirmButton>
            </li>
          ))}
        </ul>
      )}

      <form
        className="flex flex-wrap items-end gap-2 px-5 py-4"
        onSubmit={(event) => {
          event.preventDefault();
          add();
        }}
      >
        <label className="flex min-w-48 flex-1 flex-col gap-1.5">
          <span className="text-[13px] font-medium text-ink-2">When the statement text contains</span>
          <Input
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="e.g. Miete, a customer number, a name"
            maxLength={80}
            className="w-full"
          />
        </label>
        <div className="flex w-56 flex-col gap-1.5">
          <span className="text-[13px] font-medium text-ink-2">categorise as</span>
          <CategorySelect
            categories={categories}
            value={categoryId}
            onChange={setCategoryId}
            allowNone={false}
            placeholder="Choose a category"
            label="Category for the new rule"
          />
        </div>
        <Button type="submit" variant="primary" disabled={pending || text.trim().length < 3 || categoryId === null}>
          Add rule
        </Button>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline px-5 py-3">
        <p className="text-[13px] text-ink-3">
          Rules apply to new imports and never override a category you set by hand.
        </p>
        <Button size="sm" disabled={pending} onClick={reapply}>
          <RotateCcw aria-hidden className="size-3.5" />
          Re-apply to all transactions
        </Button>
      </div>
    </div>
  );
}
