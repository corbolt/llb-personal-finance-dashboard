/**
 * Money is stored and computed as integer minor units ("cents" / Rappen) so
 * sums never accumulate floating point error. Formatting follows Swiss
 * conventions: `CHF 1’234.50`.
 *
 * Numbers are formatted by hand rather than with `Intl.NumberFormat`: the
 * grouping character for Swiss locales differs between the ICU data in
 * Node.js and in browsers, and a component rendered on the server and then
 * hydrated in the browser must produce the very same text in both.
 */

export type Cents = number;

const MINUS = "−"; // typographic minus, as wide as a digit
const GROUP = "’"; // ’ — the Swiss thousands separator

function group(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, GROUP);
}

/** `123456` → `1’234.56` */
function withDecimals(absoluteCents: number): string {
  const cents = Math.round(absoluteCents);
  const whole = Math.floor(cents / 100);
  return `${group(String(whole))}.${String(cents % 100).padStart(2, "0")}`;
}

/** `123456` → `1’235` */
function wholeUnits(absoluteCents: number): string {
  return group(String(Math.round(absoluteCents / 100)));
}

/** Converts a decimal amount as found in a spreadsheet cell to minor units. */
export function toCents(value: number): Cents {
  return Math.round(value * 100);
}

export type SignDisplay = "auto" | "always" | "never";

export interface AmountFormat {
  /** `auto` shows a minus for negatives, `always` adds a plus for positives. */
  sign?: SignDisplay;
  /** Drop the decimals (rounds to whole units). */
  whole?: boolean;
}

function signFor(cents: Cents, sign: SignDisplay): string {
  if (sign === "never" || cents === 0) return "";
  if (cents < 0) return MINUS;
  return sign === "always" ? "+" : "";
}

function digitsFor(cents: Cents, whole: boolean): string {
  return whole ? wholeUnits(Math.abs(cents)) : withDecimals(Math.abs(cents));
}

/** `1’234.50` — the bare number without a currency code. */
export function formatAmount(cents: Cents, format: AmountFormat = {}): string {
  const { sign = "auto", whole = false } = format;
  return `${signFor(cents, sign)}${digitsFor(cents, whole)}`;
}

/** `CHF 1’234.50`, `−CHF 12.00`, `+CHF 620.00`. */
export function formatMoney(cents: Cents, currency = "CHF", format: AmountFormat = {}): string {
  const { sign = "auto", whole = false } = format;
  return `${signFor(cents, sign)}${currency} ${digitsFor(cents, whole)}`;
}

/** Splits an amount into its whole and fractional parts for display emphasis. */
export function splitAmount(cents: Cents): { sign: string; whole: string; fraction: string } {
  const abs = Math.abs(Math.round(cents));
  return {
    sign: cents < 0 ? MINUS : "",
    whole: group(String(Math.floor(abs / 100))),
    fraction: String(abs % 100).padStart(2, "0"),
  };
}

/** How a language writes thousands and millions on an axis: `7.5K`, `7.5 Tsd.` */
export interface CompactUnits {
  thousands: (value: string) => string;
  millions: (value: string) => string;
}

/**
 * Axis tick label: written in full below 10,000 and compact from there on, so
 * every tick on one axis uses the same style. The compact units come from the
 * interface language — use `format.axisValue` from `src/i18n` in components.
 */
export function formatAxisValue(units: number, axisMax: number, compact: CompactUnits): string {
  const abs = Math.abs(units);
  const sign = units < 0 ? MINUS : "";
  if (Math.abs(axisMax) < 10_000) return `${sign}${group(String(Math.round(abs)))}`;
  if (abs >= 1_000_000) return `${sign}${compact.millions(trimZero(abs / 1_000_000))}`;
  if (abs >= 1_000) return `${sign}${compact.thousands(trimZero(abs / 1_000))}`;
  return `${sign}${Math.round(abs)}`;
}

function trimZero(n: number): string {
  return n.toFixed(1).replace(/\.0$/, "");
}

/** Parses user input such as `1'200`, `1200.50` or `1.200,50` into minor units. */
export function parseMoneyInput(input: string): Cents | null {
  const cleaned = input.replace(/[\s'’`_]/g, "").replace(/[A-Za-z]/g, "");
  if (cleaned === "") return null;
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  // whichever of comma and dot comes last is the decimal separator
  const normalized =
    lastComma > lastDot ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned.replace(/,/g, "");
  if (!/^[-+]?\d*\.?\d+$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? toCents(value) : null;
}
