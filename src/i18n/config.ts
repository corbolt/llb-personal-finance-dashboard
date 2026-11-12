/**
 * The languages the interface comes in.
 *
 * A locale is a BCP 47 tag; it is the first segment of every URL
 * (`/de-LI/budgets`) and the `lang` of the page. To add a language, write its
 * catalog in `messages/`, register it in `messages/index.ts` and add it here.
 */
export const locales = ["en", "de-LI"] as const;

export type Locale = (typeof locales)[number];

/** Used when neither the stored choice nor the browser asks for anything else. */
export const defaultLocale: Locale = "en";

/** Every language under its own name, for the language menu. */
export const localeNames: Record<Locale, string> = {
  en: "English",
  "de-LI": "Deutsch (Liechtenstein)",
};

/** Cookie that remembers the language picked in the menu. */
export const LOCALE_COOKIE = "locale";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

/** The locale written in any letter case (`de-li`), or `null` if it is none. */
export function canonicalLocale(value: string): Locale | null {
  const wanted = value.toLowerCase();
  return locales.find((locale) => locale.toLowerCase() === wanted) ?? null;
}

/** The locale for a language tag: itself, or the one sharing its language (`de-CH` → `de-LI`). */
function localeForTag(tag: string): Locale | null {
  const exact = canonicalLocale(tag);
  if (exact) return exact;
  const language = tag.toLowerCase().split("-")[0];
  return locales.find((locale) => locale.toLowerCase().split("-")[0] === language) ?? null;
}

/**
 * Picks the language for a visitor whose URL names none: the choice stored by
 * the language menu, else the best match for the browser's `Accept-Language`
 * header, else the default.
 */
export function negotiateLocale(stored: string | undefined, acceptLanguage: string | null): Locale {
  if (isLocale(stored)) return stored;

  const preferences = (acceptLanguage ?? "")
    .split(",")
    .map((part, position) => {
      const [tag, ...attributes] = part.trim().split(";");
      const quality = attributes.map((attribute) => /^\s*q=(.+)$/.exec(attribute)?.[1]).find(Boolean);
      return { tag: tag.trim(), quality: quality === undefined ? 1 : Number(quality), position };
    })
    .filter(({ tag, quality }) => tag !== "" && tag !== "*" && quality > 0)
    // most preferred first; the header's own order breaks ties
    .sort((a, b) => b.quality - a.quality || a.position - b.position);

  for (const { tag } of preferences) {
    const locale = localeForTag(tag);
    if (locale) return locale;
  }
  return defaultLocale;
}

/** `/budgets` → `/de-LI/budgets`, `/` → `/de-LI` */
export function localizePath(locale: Locale, path: string): string {
  return path === "/" ? `/${locale}` : `/${locale}${path}`;
}

/** The same page in another language: `/en/budgets` → `/de-LI/budgets`. */
export function switchLocalePath(pathname: string, to: Locale): string {
  const [, first = "", ...rest] = pathname.split("/");
  const path = isLocale(first) ? rest.join("/") : [first, ...rest].join("/");
  return localizePath(to, path === "" ? "/" : `/${path}`);
}
