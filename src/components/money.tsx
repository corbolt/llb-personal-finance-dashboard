import { cn } from "@/lib/cn";
import { formatAmount, formatMoney, splitAmount, type SignDisplay } from "@/lib/money";

/** A money amount with its currency, e.g. `CHF 1’234.50`. */
export function Money({
  cents,
  currency = "CHF",
  sign = "auto",
  whole = false,
  className,
}: {
  cents: number;
  currency?: string;
  sign?: SignDisplay;
  whole?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("whitespace-nowrap", className)}>
      {formatMoney(cents, currency, { sign, whole })}
    </span>
  );
}

/**
 * An amount in a list or table: money in is green and carries a plus sign,
 * money out is plain ink with a minus. The sign, not the colour, is the cue.
 */
export function FlowAmount({
  cents,
  muted = false,
  className,
}: {
  cents: number;
  /** For bookings that do not count: transfers and excluded ones. */
  muted?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "tabular whitespace-nowrap",
        muted ? "text-ink-3" : cents > 0 ? "text-positive" : "text-ink",
        className,
      )}
    >
      {formatAmount(cents, { sign: "always" })}
    </span>
  );
}

/** A large headline figure with de-emphasised decimals. */
export function Figure({
  cents,
  currency = "CHF",
  className,
  size = "lg",
}: {
  cents: number;
  currency?: string;
  className?: string;
  size?: "lg" | "xl";
}) {
  const { sign, whole, fraction } = splitAmount(cents);
  return (
    <span
      className={cn(
        "font-semibold tracking-tight whitespace-nowrap text-ink",
        size === "xl" ? "text-5xl" : "text-[1.75rem] leading-9",
        className,
      )}
    >
      <span className={cn("font-medium text-ink-3", size === "xl" ? "mr-2 text-2xl" : "mr-1.5 text-base")}>
        {currency}
      </span>
      {sign}
      {whole}
      <span className="text-ink-3">.{fraction}</span>
    </span>
  );
}
