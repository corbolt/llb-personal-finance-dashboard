import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/*
 * Building blocks of a page. They take their texts as props, so Server and
 * Client Components can both use them.
 */

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
export function PageSkeleton({
  label,
  rows = 2,
}: {
  /** What a screen reader announces meanwhile, e.g. "Loading". */
  label: string;
  rows?: number;
}) {
  return (
    <div aria-busy="true" aria-label={label} className="space-y-4">
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
