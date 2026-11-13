"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";

import { fromTop, niceScale } from "./scale";

export interface LineSeries {
  id: string;
  label: string;
  /** CSS colour of the line, e.g. `var(--accent)`. */
  color: string;
  /** Minor units per x position; `null` where the series has no data. */
  values: Array<number | null>;
  /** Fill the space between the line and zero with a faint wash. */
  area?: boolean;
  /** Print the latest value next to the end of the line. */
  labelEnd?: boolean;
}

export interface LineChartProps {
  /** Name of each x position, shown in the tooltip. */
  labels: string[];
  /** The x positions that get an axis label; `className` can hide one on narrow screens. */
  ticks: Array<{ index: number; label: string; className?: string }>;
  series: LineSeries[];
  currency?: string;
  /** Height of the plot area in pixels (axis labels come on top). */
  height?: number;
  /** What the chart shows, for assistive technology. */
  description: string;
}

/**
 * Line chart drawn as a stretched SVG path with HTML labels around it, so it
 * is fully rendered on the server and scales with its container without
 * measuring. Hovering (or arrow keys while focused) shows a crosshair and a
 * tooltip listing every series at that position.
 */
export function LineChart({
  labels,
  ticks,
  series,
  currency = "CHF",
  height = 208,
  description,
}: LineChartProps) {
  const { format } = useI18n();
  const plot = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<number | null>(null);

  const count = labels.length;
  const numbers = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  const scale = niceScale(Math.min(0, ...numbers) / 100, Math.max(0, ...numbers) / 100);
  const x = (index: number) => (count <= 1 ? 50 : (index / (count - 1)) * 100);
  const y = (cents: number) => fromTop(scale, cents / 100);
  const zero = y(0);

  const widestTick = scale.ticks
    .map((tick) => format.axisValue(tick, scale.max))
    .reduce((a, b) => (b.length > a.length ? b : a), "");

  function indexAt(clientX: number): number | null {
    const box = plot.current?.getBoundingClientRect();
    if (!box || box.width === 0) return null;
    const ratio = (clientX - box.left) / box.width;
    return Math.min(count - 1, Math.max(0, Math.round(ratio * (count - 1))));
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    setActive(indexAt(event.clientX));
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const current = active ?? count - 1;
    const next =
      event.key === "ArrowLeft"
        ? Math.max(0, current - 1)
        : event.key === "ArrowRight"
          ? Math.min(count - 1, current + 1)
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? count - 1
              : null;
    if (event.key === "Escape") setActive(null);
    if (next === null) return;
    event.preventDefault();
    setActive(next);
  }

  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2.5">
      {/* y axis */}
      <div className="relative text-right text-[11px] text-ink-3 tabular" style={{ height }} aria-hidden>
        <span className="invisible block">{widestTick}</span>
        {scale.ticks.map((tick) => (
          <span
            key={tick}
            className="absolute right-0 -translate-y-1/2 leading-none whitespace-nowrap"
            style={{ top: `${fromTop(scale, tick)}%` }}
          >
            {format.axisValue(tick, scale.max)}
          </span>
        ))}
      </div>

      {/* plot */}
      <div
        ref={plot}
        role="img"
        aria-label={description}
        tabIndex={0}
        className="relative touch-pan-y rounded-sm outline-offset-4"
        style={{ height }}
        onPointerMove={onPointerMove}
        onPointerDown={onPointerMove}
        onPointerLeave={() => setActive(null)}
        onKeyDown={onKeyDown}
        onFocus={() => setActive((current) => current ?? lastIndex(series))}
        onBlur={() => setActive(null)}
      >
        {scale.ticks.map((tick) => (
          <div
            key={tick}
            aria-hidden
            className={cn("absolute inset-x-0 border-t", tick === 0 ? "border-axis" : "border-hairline")}
            style={{ top: `${fromTop(scale, tick)}%` }}
          />
        ))}

        <svg
          aria-hidden
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 size-full overflow-visible"
        >
          {series.map((s) =>
            s.area
              ? segments(s.values).map((segment) => (
                  <path
                    key={`${s.id}-area-${segment[0]}`}
                    d={`M${x(segment[0])},${zero} ${segment
                      .map((i) => `L${x(i)},${y(s.values[i]!)}`)
                      .join(" ")} L${x(segment[segment.length - 1])},${zero} Z`}
                    fill={s.color}
                    fillOpacity={0.1}
                  />
                ))
              : null,
          )}
          {series.map((s) =>
            segments(s.values).map((segment) => (
              <path
                key={`${s.id}-${segment[0]}`}
                d={segment.map((i, n) => `${n === 0 ? "M" : "L"}${x(i)},${y(s.values[i]!)}`).join(" ")}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            )),
          )}
        </svg>

        {/* end markers and their labels */}
        {series.map((s) => {
          const end = lastDefined(s.values);
          if (end === null) return null;
          const left = x(end);
          const top = y(s.values[end]!);
          return (
            <div key={s.id} aria-hidden>
              <Dot left={left} top={top} color={s.color} />
              {s.labelEnd ? (
                <span
                  className={cn(
                    "absolute text-xs font-medium whitespace-nowrap text-ink tabular",
                    left > 78 ? "-translate-x-full pr-2" : "pl-2.5",
                    top < 14 ? "translate-y-2" : "-translate-y-[130%]",
                  )}
                  style={{ left: `${left}%`, top: `${top}%` }}
                >
                  {formatMoney(s.values[end]!, currency, { whole: true })}
                </span>
              ) : null}
            </div>
          );
        })}

        {/* hover layer */}
        {active !== null ? (
          <>
            <div
              aria-hidden
              className="absolute inset-y-0 w-px -translate-x-1/2 bg-axis"
              style={{ left: `${x(active)}%` }}
            />
            {series.map((s) => {
              const value = s.values[active];
              return value === null || value === undefined ? null : (
                <Dot key={s.id} left={x(active)} top={y(value)} color={s.color} />
              );
            })}
            <div
              role="status"
              className={cn(
                "pointer-events-none absolute top-0 z-10 min-w-36 rounded-lg border border-line bg-popover px-3 py-2 shadow-popover",
                x(active) > 55 ? "-translate-x-full" : "",
              )}
              style={{
                left: `${x(active)}%`,
                marginLeft: x(active) > 55 ? -12 : 12,
              }}
            >
              <p className="text-xs text-ink-2">{labels[active]}</p>
              <ul className="mt-1 space-y-0.5">
                {series.map((s) => {
                  const value = s.values[active];
                  return (
                    <li key={s.id} className="flex items-center gap-2 text-[13px]">
                      <span
                        aria-hidden
                        className="h-0.5 w-3 shrink-0 rounded-full"
                        style={{ background: s.color }}
                      />
                      <span className="text-ink-2">{s.label}</span>
                      <span className="ml-auto pl-3 font-semibold text-ink tabular">
                        {value === null || value === undefined ? "–" : formatMoney(value, currency)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </>
        ) : null}
      </div>

      {/* x axis */}
      <div aria-hidden />
      <div className="relative mt-2 h-4 text-[11px] text-ink-3" aria-hidden>
        {ticks.map((tick) => {
          const left = x(tick.index);
          return (
            <span
              key={tick.index}
              className={cn(
                "absolute whitespace-nowrap leading-none",
                left <= 2 ? "" : left >= 98 ? "-translate-x-full" : "-translate-x-1/2",
                tick.className,
              )}
              style={{ left: `${left}%` }}
            >
              {tick.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/** A marker with a ring in the surface colour so it stays legible on a line. */
function Dot({ left, top, color }: { left: number; top: number; color: string }) {
  return (
    <span
      aria-hidden
      className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface"
      style={{ left: `${left}%`, top: `${top}%`, background: color }}
    />
  );
}

/** Runs of consecutive positions that have a value. */
function segments(values: Array<number | null>): number[][] {
  const runs: number[][] = [];
  let run: number[] = [];
  values.forEach((value, index) => {
    if (value === null) {
      if (run.length) runs.push(run);
      run = [];
    } else {
      run.push(index);
    }
  });
  if (run.length) runs.push(run);
  return runs;
}

function lastDefined(values: Array<number | null>): number | null {
  for (let i = values.length - 1; i >= 0; i--) if (values[i] !== null) return i;
  return null;
}

/** The right-most position at which any series has a value. */
function lastIndex(series: LineSeries[]): number {
  return Math.max(0, ...series.map((s) => lastDefined(s.values) ?? 0));
}
