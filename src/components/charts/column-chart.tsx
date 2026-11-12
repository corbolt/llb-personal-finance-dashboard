"use client";

import { useState } from "react";

import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";

import { fromTop, niceScale } from "./scale";

export interface ColumnSeries {
  id: string;
  label: string;
  /** CSS colour of the bars. */
  color: string;
}

export interface ColumnGroup {
  /** Axis label; an empty string leaves the tick unlabelled. */
  label: string;
  /** Full name for the tooltip, e.g. "October 2026". */
  title: string;
  /** One value per series, in minor units. */
  values: number[];
  /** Extra line in the tooltip, e.g. "partial month". */
  note?: string;
}

export interface ColumnChartProps {
  groups: ColumnGroup[];
  series: ColumnSeries[];
  currency?: string;
  height?: number;
  /** Which bars get their value printed on the cap. */
  directLabels?: "last" | "max" | "none";
  description: string;
}

/**
 * Column chart built from plain elements: thin bars (never wider than 24px)
 * growing from a shared baseline, with the whole column as hover and focus
 * target. The tooltip lists every series of the hovered group.
 */
export function ColumnChart({
  groups,
  series,
  currency = "CHF",
  height = 208,
  directLabels = "none",
  description,
}: ColumnChartProps) {
  const { format } = useI18n();
  const [active, setActive] = useState<number | null>(null);

  const all = groups.flatMap((group) => group.values);
  const scale = niceScale(0, Math.max(0, ...all) / 100);
  const barHeight = (cents: number) => Math.max(0, 100 - fromTop(scale, Math.max(0, cents) / 100));

  const widestTick = scale.ticks
    .map((tick) => format.axisValue(tick, scale.max))
    .reduce((a, b) => (b.length > a.length ? b : a), "");
  /** The value on a bar's cap: always in the compact style, however small the axis. */
  const compact = (cents: number) => format.axisValue(Math.round(cents / 100), Math.max(scale.max, 10_000));

  let labelled = -1;
  if (directLabels === "last") labelled = groups.length - 1;
  if (directLabels === "max") {
    const peaks = groups.map((group) => Math.max(...group.values));
    labelled = peaks.indexOf(Math.max(...peaks));
  }

  return (
    <div
      role="group"
      aria-label={description}
      className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2.5"
    >
      <div className="relative text-right text-[11px] text-ink-3 tabular" style={{ height }} aria-hidden>
        <span className="invisible block">{widestTick}</span>
        {scale.ticks.map((tick) => (
          <span
            key={tick}
            className="absolute right-0 -translate-y-1/2 leading-none"
            style={{ top: `${fromTop(scale, tick)}%` }}
          >
            {format.axisValue(tick, scale.max)}
          </span>
        ))}
      </div>

      <div className="relative" style={{ height }} onPointerLeave={() => setActive(null)}>
        {scale.ticks.map((tick) => (
          <div
            key={tick}
            aria-hidden
            className={cn("absolute inset-x-0 border-t", tick === 0 ? "border-axis" : "border-hairline")}
            style={{ top: `${fromTop(scale, tick)}%` }}
          />
        ))}

        <div className="absolute inset-0 grid auto-cols-fr grid-flow-col">
          {groups.map((group, index) => {
            const isActive = active === index;
            const position = groups.length <= 1 ? 50 : (index / (groups.length - 1)) * 100;
            return (
              <div
                key={index}
                tabIndex={index === (active ?? groups.length - 1) ? 0 : -1}
                role="img"
                aria-label={`${group.title}: ${series
                  .map((s, n) => `${s.label} ${formatMoney(group.values[n] ?? 0, currency)}`)
                  .join(", ")}`}
                className={cn(
                  "relative flex h-full items-end justify-center gap-0.5 rounded-t-sm px-px outline-offset-0 transition-colors",
                  isActive && "bg-wash/70",
                )}
                onPointerEnter={() => setActive(index)}
                onPointerDown={() => setActive(index)}
                onFocus={() => setActive(index)}
                onBlur={() => setActive((current) => (current === index ? null : current))}
                onKeyDown={(event) => {
                  // arrow keys walk the columns; Tab leaves the chart
                  const sibling =
                    event.key === "ArrowRight"
                      ? event.currentTarget.nextElementSibling
                      : event.key === "ArrowLeft"
                        ? event.currentTarget.previousElementSibling
                        : null;
                  if (sibling instanceof HTMLElement) {
                    event.preventDefault();
                    sibling.focus();
                  }
                }}
              >
                {series.map((s, n) => {
                  const value = group.values[n] ?? 0;
                  const showLabel = labelled === index && value > 0;
                  return (
                    <div
                      key={s.id}
                      className="relative w-full max-w-6 rounded-t-[4px]"
                      style={{
                        height: `${barHeight(value)}%`,
                        minHeight: value > 0 ? 2 : 0,
                        background: s.color,
                        opacity: active === null || isActive ? 1 : 0.55,
                      }}
                    >
                      {showLabel ? (
                        <span
                          aria-hidden
                          className={cn(
                            "absolute bottom-full mb-1 text-[11px] font-medium whitespace-nowrap text-ink tabular",
                            series.length === 1
                              ? "left-1/2 -translate-x-1/2"
                              : n === 0
                                ? "right-0"
                                : "left-0",
                          )}
                        >
                          {compact(value)}
                        </span>
                      ) : null}
                    </div>
                  );
                })}

                {isActive ? (
                  <div
                    role="status"
                    className={cn(
                      "pointer-events-none absolute z-10 mb-2 min-w-40 rounded-lg border border-line bg-popover px-3 py-2 text-left shadow-popover",
                      position < 25 ? "left-0" : position > 75 ? "right-0" : "left-1/2 -translate-x-1/2",
                    )}
                    // sits just above the tallest bar of the group
                    style={{ bottom: `${Math.max(...group.values.map(barHeight))}%` }}
                  >
                    <p className="text-xs text-ink-2">{group.title}</p>
                    <ul className="mt-1 space-y-0.5">
                      {series.map((s, n) => (
                        <li key={s.id} className="flex items-center gap-2 text-[13px]">
                          <span
                            aria-hidden
                            className="size-2 shrink-0 rounded-[2px]"
                            style={{ background: s.color }}
                          />
                          <span className="text-ink-2">{s.label}</span>
                          <span className="ml-auto pl-3 font-semibold text-ink tabular">
                            {formatMoney(group.values[n] ?? 0, currency)}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {group.note ? <p className="mt-1 text-xs text-ink-3">{group.note}</p> : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <div aria-hidden />
      <div className="mt-2 grid auto-cols-fr grid-flow-col text-[11px] text-ink-3" aria-hidden>
        {groups.map((group, index) => (
          <span key={index} className="flex justify-center leading-none whitespace-nowrap">
            {group.label}
          </span>
        ))}
      </div>
    </div>
  );
}
