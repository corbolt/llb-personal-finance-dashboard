import { locales, type Locale } from "./config";
import { createI18n, type I18n } from "./index";
import { catalogs } from "./messages";

// One per language for the lifetime of the server: an `I18n` holds no request state.
const instances = Object.fromEntries(
  locales.map((locale) => [locale, createI18n(locale, catalogs[locale])]),
) as Record<Locale, I18n>;

/**
 * The interface in a given language, with every catalog at hand. For the
 * server only — importing this into a Client Component would ship all
 * languages to the browser; those use `useI18n()`.
 */
export function i18nFor(locale: Locale): I18n {
  return instances[locale];
}
