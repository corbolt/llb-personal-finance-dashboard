"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { setBudget } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { formatAmount, parseMoneyInput } from "@/lib/money";

/**
 * Inline control to set, change or remove a category's monthly budget.
 * Collapsed it is a single button; expanded an amount field.
 */
export function BudgetEditor({
  categoryId,
  categoryName,
  budget,
  suggestion,
}: {
  categoryId: number;
  categoryName: string;
  /** Current budget in minor units, or `null` if none is set. */
  budget: number | null;
  /** Amount to prefill when there is no budget yet. */
  suggestion?: number | null;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();

  function open() {
    const initial = budget ?? suggestion ?? null;
    setText(initial === null ? "" : formatAmount(initial, { whole: initial % 100 === 0 }).replace(/[’']/g, ""));
    setEditing(true);
  }

  function save(amount: number | null) {
    startTransition(async () => {
      const result = await setBudget(categoryId, amount);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(amount === null ? `Budget for ${categoryName} removed` : `Budget for ${categoryName} saved`);
      setEditing(false);
    });
  }

  if (!editing) {
    return (
      <Button size="sm" variant={budget === null ? "secondary" : "ghost"} onClick={open}>
        {budget === null ? "Set budget" : "Edit"}
      </Button>
    );
  }

  const amount = parseMoneyInput(text);
  const valid = amount !== null && amount > 0;

  return (
    <form
      className="flex items-center gap-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        if (valid) save(amount);
      }}
    >
      <label className="relative">
        <span className="sr-only">Monthly budget for {categoryName} in CHF</span>
        <span aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-[13px] text-ink-3">
          CHF
        </span>
        <Input
          autoFocus
          inputMode="decimal"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setEditing(false);
          }}
          className="h-8 w-32 pl-11 text-right tabular"
        />
      </label>
      <Button type="submit" size="sm" variant="primary" disabled={pending || !valid}>
        Save
      </Button>
      {budget !== null ? (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => save(null)}>
          Remove
        </Button>
      ) : null}
      <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
        Cancel
      </Button>
    </form>
  );
}
