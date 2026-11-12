"use client";

import { ChartLine, Table2 } from "lucide-react";
import { useState, type ReactNode } from "react";

import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/cn";

export interface LegendItem {
  label: string;
  color: string;
  /** Mirrors the mark: a stroke for lines, a block for bars. */
  mark: "line" | "bar";
}

export function Legend({ items }: { items: LegendItem[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-2">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className={cn("shrink-0", item.mark === "line" ? "h-0.5 w-3.5 rounded-full" : "size-2.5 rounded-[3px]")}
            style={{ background: item.color }}
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

/**
 * Card around a chart. Every chart comes with the same numbers as a table —
 * for screen readers, for exact values, and for the series whose colour is
 * too light to read against the surface on its own.
 */
export function ChartFrame({
  title,
  description,
  legend,
  chart,
  table,
  footnote,
  className,
}: {
  title: string;
  description?: ReactNode;
  /** Shown for charts with two or more series. */
  legend?: LegendItem[];
  chart: ReactNode;
  table: ReactNode;
  footnote?: ReactNode;
  className?: string;
}) {
  const { t } = useI18n();
  const [view, setView] = useState<"chart" | "table">("chart");
  const showTable = view === "table";
  const switchLabel = showTable ? t("chart.showAsChart") : t("chart.showAsTable");

  return (
    <section className={cn("rounded-xl border border-line bg-surface", className)}>
      <header className="flex items-start justify-between gap-4 px-5 pt-4 pb-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          {description ? <p className="mt-0.5 text-[13px] text-ink-2">{description}</p> : null}
        </div>
        <button
          type="button"
          onClick={() => setView(showTable ? "chart" : "table")}
          aria-pressed={showTable}
          title={switchLabel}
          className="grid size-8 shrink-0 place-items-center rounded-lg text-ink-3 transition-colors hover:bg-wash hover:text-ink"
        >
          {showTable ? (
            <ChartLine aria-hidden className="size-4" strokeWidth={1.75} />
          ) : (
            <Table2 aria-hidden className="size-4" strokeWidth={1.75} />
          )}
          <span className="sr-only">{switchLabel}</span>
        </button>
      </header>
      <div className="px-5 pb-5">
        {showTable ? (
          <div className="max-h-80 overflow-auto">{table}</div>
        ) : (
          <>
            {legend && legend.length > 1 ? (
              <div className="mb-4">
                <Legend items={legend} />
              </div>
            ) : null}
            {chart}
          </>
        )}
        {footnote ? <p className="mt-3 text-xs text-ink-3">{footnote}</p> : null}
      </div>
    </section>
  );
}
