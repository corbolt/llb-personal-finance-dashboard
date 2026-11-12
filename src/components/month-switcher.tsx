import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import { getI18n } from "@/i18n/server";
import { addMonths, type IsoMonth } from "@/lib/dates";
import type { QueryValue } from "@/lib/url";

/** Steps through months; the range is limited to months that have data. */
export async function MonthSwitcher({
  month,
  min,
  max,
  path,
  query = {},
}: {
  month: IsoMonth;
  min: IsoMonth;
  max: IsoMonth;
  /** The page to stay on, without the language: `/budgets`. */
  path: string;
  /** Other search params to keep when switching. */
  query?: Record<string, QueryValue>;
}) {
  const { t, format, link } = await getI18n();
  const previous = addMonths(month, -1);
  const next = addMonths(month, 1);
  const arrow =
    "grid size-9 place-items-center text-ink-2 transition-colors hover:bg-wash hover:text-ink";
  const disabled = "grid size-9 place-items-center text-ink-3/50";

  return (
    <div className="inline-flex items-center overflow-hidden rounded-lg border border-line bg-surface">
      {previous >= min ? (
        <Link
          href={link(path, { ...query, m: previous })}
          scroll={false}
          aria-label={t("month.previous", { month: format.month(previous) })}
          className={arrow}
        >
          <ChevronLeft aria-hidden className="size-4" />
        </Link>
      ) : (
        <span className={disabled}>
          <ChevronLeft aria-hidden className="size-4" />
        </span>
      )}
      <span className="min-w-[8.5rem] px-1 text-center text-sm font-medium text-ink">
        {format.month(month)}
      </span>
      {next <= max ? (
        <Link
          href={link(path, { ...query, m: next })}
          scroll={false}
          aria-label={t("month.next", { month: format.month(next) })}
          className={arrow}
        >
          <ChevronRight aria-hidden className="size-4" />
        </Link>
      ) : (
        <span className={disabled}>
          <ChevronRight aria-hidden className="size-4" />
        </span>
      )}
    </div>
  );
}
