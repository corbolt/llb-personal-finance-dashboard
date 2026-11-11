import { cn } from "@/lib/cn";

export type MeterTone = "accent" | "warning" | "critical";

const FILL: Record<MeterTone, string> = {
  accent: "var(--accent)",
  warning: "var(--warning)",
  critical: "var(--critical)",
};

/** Track: a lighter step of the fill's own hue, so the whole bar reads as one state. */
const TRACK: Record<MeterTone, string> = {
  accent: "var(--accent-track)",
  warning: "color-mix(in oklab, var(--warning) 24%, var(--surface))",
  critical: "color-mix(in oklab, var(--critical) 20%, var(--surface))",
};

/** A single ratio against its limit. */
export function Meter({
  value,
  limit,
  tone = "accent",
  label,
  className,
}: {
  value: number;
  limit: number;
  tone?: MeterTone;
  /** Accessible description, e.g. "Groceries: CHF 320 of CHF 400". */
  label: string;
  className?: string;
}) {
  const ratio = limit > 0 ? Math.min(1, Math.max(0, value / limit)) : value > 0 ? 1 : 0;
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.max(limit, 0)}
      aria-valuenow={Math.max(0, value)}
      className={cn("h-2 overflow-hidden rounded-full", className)}
      style={{ background: TRACK[tone] }}
    >
      <div className="h-full rounded-full" style={{ width: `${ratio * 100}%`, background: FILL[tone] }} />
    </div>
  );
}
