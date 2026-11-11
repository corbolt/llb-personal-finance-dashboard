import Link from "next/link";

import { CategoryIcon } from "@/components/category-icon";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";

export interface RankedItem {
  key: string;
  label: string;
  /** Category icon name; `null` renders the "uncategorised" placeholder. */
  icon?: string | null;
  /** Minor units. */
  value: number;
  /** Secondary text under the label. */
  note?: string;
  href?: string;
}

/**
 * Parts of a whole as ranked bars on one baseline, all in one colour: the
 * bars are for comparing sizes, the icon and name say which part is which.
 */
export function RankedBars({
  items,
  total,
  currency = "CHF",
  showShare = true,
}: {
  /** Largest first. */
  items: RankedItem[];
  /** The whole the shares refer to; defaults to the sum of positive items. */
  total?: number;
  currency?: string;
  showShare?: boolean;
}) {
  const largest = Math.max(0, ...items.map((item) => item.value));
  const whole = total ?? items.reduce((sum, item) => sum + Math.max(0, item.value), 0);

  return (
    <ul className="-mx-2">
      {items.map((item) => {
        const width = largest > 0 && item.value > 0 ? (item.value / largest) * 100 : 0;
        const share = whole > 0 && item.value > 0 ? Math.round((item.value / whole) * 100) : null;
        const content = (
          <>
            {item.icon !== undefined ? <CategoryIcon name={item.icon} /> : null}
            <div className="min-w-0">
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-sm text-ink">
                  {item.label}
                  {item.note ? <span className="ml-2 text-[13px] text-ink-3">{item.note}</span> : null}
                </span>
                <span className="shrink-0 text-sm text-ink tabular">
                  {formatMoney(item.value, currency)}
                  {showShare ? (
                    <span className="ml-2 inline-block w-9 text-right text-[13px] text-ink-3">
                      {share === null ? "" : share < 1 ? "<1%" : `${share}%`}
                    </span>
                  ) : null}
                </span>
              </div>
              <div className="mt-1.5 h-2">
                <div
                  className="h-full min-w-0.5 rounded-r-[4px] bg-accent"
                  style={{ width: `${width}%`, display: width > 0 ? undefined : "none" }}
                />
              </div>
            </div>
          </>
        );
        const rowClass = cn(
          "grid items-center gap-3 rounded-lg px-2 py-2",
          item.icon !== undefined ? "grid-cols-[auto_minmax(0,1fr)]" : "grid-cols-1",
        );
        return (
          <li key={item.key}>
            {item.href ? (
              <Link href={item.href} className={cn(rowClass, "transition-colors hover:bg-wash/70")}>
                {content}
              </Link>
            ) : (
              <div className={rowClass}>{content}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
