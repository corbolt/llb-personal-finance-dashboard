"use client";

import { Select } from "@base-ui/react/select";
import { Check, ChevronsUpDown } from "lucide-react";

import { CategoryGlyph } from "@/components/category-icon";
import { cn } from "@/lib/cn";

export interface CategoryOption {
  id: number;
  name: string;
  kind: "expense" | "income" | "transfer";
  icon: string;
}

const GROUPS: Array<{ kind: CategoryOption["kind"]; label: string }> = [
  { kind: "expense", label: "Spending" },
  { kind: "income", label: "Income" },
  { kind: "transfer", label: "Transfers" },
];

const NONE = "none";

/**
 * Picks a category. `chip` is the compact form used inside lists; `field`
 * looks like the other form controls.
 */
export function CategorySelect({
  categories,
  value,
  onChange,
  variant = "field",
  allowNone = true,
  placeholder = "Uncategorised",
  disabled = false,
  label,
  className,
}: {
  categories: CategoryOption[];
  value: number | null;
  onChange: (categoryId: number | null) => void;
  variant?: "chip" | "field";
  /** Offer an entry that clears the category. */
  allowNone?: boolean;
  placeholder?: string;
  disabled?: boolean;
  /** Accessible name of the control. */
  label: string;
  className?: string;
}) {
  const selected = categories.find((category) => category.id === value) ?? null;

  return (
    <Select.Root
      value={value === null ? null : String(value)}
      onValueChange={(next) => onChange(next === null || next === NONE ? null : Number(next))}
      disabled={disabled}
    >
      <Select.Trigger
        aria-label={label}
        className={cn(
          "group flex min-w-0 items-center gap-1.5 text-left transition-colors select-none data-disabled:opacity-60",
          variant === "chip"
            ? "h-7 max-w-full rounded-md px-2 text-[13px] hover:bg-wash data-popup-open:bg-wash"
            : "h-9 w-full rounded-lg border border-line bg-surface px-3 text-sm hover:border-axis data-popup-open:border-accent",
          selected ? "text-ink-2" : "text-ink-3",
          variant === "chip" && !selected && "border border-dashed border-axis",
          className,
        )}
      >
        <CategoryGlyph name={selected?.icon ?? null} className="size-3.5" />
        <span className={cn("truncate", variant === "field" && selected && "text-ink")}>
          {selected?.name ?? placeholder}
        </span>
        <ChevronsUpDown
          aria-hidden
          className={cn(
            "ml-auto size-3.5 shrink-0 text-ink-3",
            variant === "chip" && "opacity-0 transition-opacity group-hover:opacity-100 group-data-popup-open:opacity-100",
          )}
        />
      </Select.Trigger>

      <Select.Portal>
        <Select.Positioner alignItemWithTrigger={false} sideOffset={6} align="start" className="z-50 outline-none">
          <Select.Popup className="max-h-[min(var(--available-height),26rem)] min-w-56 origin-(--transform-origin) overflow-y-auto rounded-xl border border-line bg-popover py-1.5 shadow-popover outline-none transition-[opacity,scale] duration-100 data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0">
            <Select.List>
              {GROUPS.map((group) => {
                const options = categories.filter((category) => category.kind === group.kind);
                if (options.length === 0) return null;
                return (
                  <Select.Group key={group.kind} className="pb-1">
                    <Select.GroupLabel className="px-3 pt-2 pb-1 text-[11px] font-medium tracking-wide text-ink-3 uppercase">
                      {group.label}
                    </Select.GroupLabel>
                    {options.map((category) => (
                      <Item key={category.id} value={String(category.id)} icon={category.icon}>
                        {category.name}
                      </Item>
                    ))}
                  </Select.Group>
                );
              })}
              {allowNone ? (
                <>
                  <Select.Separator className="my-1 h-px bg-line" />
                  <Item value={NONE} icon={null}>
                    Uncategorised
                  </Item>
                </>
              ) : null}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}

function Item({
  value,
  icon,
  children,
}: {
  value: string;
  icon: string | null;
  children: string;
}) {
  return (
    <Select.Item
      value={value}
      className="mx-1.5 flex cursor-default items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-ink outline-none select-none data-highlighted:bg-wash"
    >
      <CategoryGlyph name={icon} className="text-ink-2" />
      <Select.ItemText className="truncate">{children}</Select.ItemText>
      <Select.ItemIndicator className="ml-auto pl-3 text-ink">
        <Check aria-hidden className="size-3.5" strokeWidth={2.25} />
      </Select.ItemIndicator>
    </Select.Item>
  );
}
