import { ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";
import { addMonths, formatMonth, type IsoMonth } from "@/lib/dates";
import { href, type QueryValue } from "@/lib/url";

export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  /** Controls shown at the end of the header. */
  children?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {description ? <p className="mt-1 text-sm text-ink-2">{description}</p> : null}
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </header>
  );
}

/** Steps through months; the range is limited to months that have data. */
export function MonthSwitcher({
  month,
  min,
  max,
  path,
  query = {},
}: {
  month: IsoMonth;
  min: IsoMonth;
  max: IsoMonth;
  path: string;
  /** Other search params to keep when switching. */
  query?: Record<string, QueryValue>;
}) {
  const previous = addMonths(month, -1);
  const next = addMonths(month, 1);
  const arrow =
    "grid size-9 place-items-center text-ink-2 transition-colors hover:bg-wash hover:text-ink";
  const disabled = "grid size-9 place-items-center text-ink-3/50";

  return (
    <div className="inline-flex items-center overflow-hidden rounded-lg border border-line bg-surface">
      {previous >= min ? (
        <Link
          href={href(path, { ...query, m: previous })}
          scroll={false}
          aria-label={`Previous month, ${formatMonth(previous)}`}
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
        {formatMonth(month)}
      </span>
      {next <= max ? (
        <Link
          href={href(path, { ...query, m: next })}
          scroll={false}
          aria-label={`Next month, ${formatMonth(next)}`}
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

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-12 text-center", className)}>
      <span className="grid size-11 place-items-center rounded-xl bg-wash text-ink-2">
        <Icon aria-hidden className="size-5" strokeWidth={1.75} />
      </span>
      <h2 className="mt-4 text-base font-semibold text-ink">{title}</h2>
      {children ? <div className="mt-1 max-w-md text-sm text-ink-2">{children}</div> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

function Block({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-wash", className)} />;
}

/** Placeholder shown in the static shell while a page's data loads. */
export function PageSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading" className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Block className="h-24" />
        <Block className="h-24" />
        <Block className="h-24" />
      </div>
      {Array.from({ length: rows }, (_, index) => (
        <Block key={index} className="h-64" />
      ))}
    </div>
  );
}

/** A labelled headline number. */
export function StatTile({
  label,
  children,
  detail,
  className,
}: {
  label: string;
  children: ReactNode;
  detail?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-line bg-surface px-5 py-4", className)}>
      <p className="text-[13px] text-ink-2">{label}</p>
      <div className="mt-1.5">{children}</div>
      {detail ? <p className="mt-1.5 text-[13px] text-ink-2">{detail}</p> : null}
    </div>
  );
}
