"use client";

import { RotateCcw, Trash2 } from "lucide-react";
import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";

import { createTextRule, deleteRule, reapplyRules } from "@/app/actions";
import { CategoryGlyph } from "@/components/category-icon";
import { CategorySelect, type CategoryOption } from "@/components/category-select";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Input } from "@/components/ui/field";
import { useI18n } from "@/i18n/client";
import type { Rule } from "@/server/queries/categories";

export function RulesManager({ rules, categories }: { rules: Rule[]; categories: CategoryOption[] }) {
  const { t } = useI18n();
  const changed = (count: number) => (count === 0 ? t("rules.noneChanged") : t("rules.recategorised", { count }));
  const strong = (content: ReactNode) => <span className="font-medium text-ink">{content}</span>;
  const [text, setText] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  function add() {
    if (categoryId === null) return;
    startTransition(async () => {
      const result = await createTextRule(text, categoryId);
      if (!result.ok) {
        toast.error(t.error(result.error));
        return;
      }
      toast.success(t("rules.added"), { description: changed(result.data) });
      setText("");
      setCategoryId(null);
    });
  }

  function remove(rule: Rule) {
    startTransition(async () => {
      const result = await deleteRule(rule.id);
      if (result.ok) toast.success(t("rules.deleted"), { description: changed(result.data) });
      else toast.error(t.error(result.error));
    });
  }

  function reapply() {
    startTransition(async () => {
      const result = await reapplyRules();
      if (result.ok) toast.success(changed(result.data));
      else toast.error(t.error(result.error));
    });
  }

  return (
    <div>
      {rules.length === 0 ? (
        <p className="px-5 pb-4 text-sm text-ink-2">{t("rules.none")}</p>
      ) : (
        <ul className="divide-y divide-hairline border-b border-hairline">
          {rules.map((rule) => (
            <li key={rule.id} className="flex items-center gap-3 px-5 py-2.5">
              <p className="min-w-0 flex-1 truncate text-sm text-ink-2">
                {rule.matchType === "merchant"
                  ? t.rich("rules.merchantIs", { merchant: rule.merchant ?? rule.pattern, b: strong })
                  : t.rich("rules.textContains", { text: rule.pattern, b: strong })}
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
                confirmLabel={t("common.confirmDelete")}
                disabled={pending}
                onConfirm={() => remove(rule)}
              >
                <Trash2 aria-hidden className="size-3.5" />
                <span className="sr-only">{t("rules.delete")}</span>
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
          <span className="text-[13px] font-medium text-ink-2">{t("rules.when")}</span>
          <Input
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={t("rules.placeholder")}
            maxLength={80}
            className="w-full"
          />
        </label>
        <div className="flex w-56 flex-col gap-1.5">
          <span className="text-[13px] font-medium text-ink-2">{t("rules.categoriseAs")}</span>
          <CategorySelect
            categories={categories}
            value={categoryId}
            onChange={setCategoryId}
            allowNone={false}
            placeholder={t("common.chooseCategory")}
            label={t("rules.categoryForNew")}
          />
        </div>
        <Button type="submit" variant="primary" disabled={pending || text.trim().length < 3 || categoryId === null}>
          {t("rules.add")}
        </Button>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline px-5 py-3">
        <p className="text-[13px] text-ink-3">{t("rules.note")}</p>
        <Button size="sm" disabled={pending} onClick={reapply}>
          <RotateCcw aria-hidden className="size-3.5" />
          {t("rules.reapply")}
        </Button>
      </div>
    </div>
  );
}
