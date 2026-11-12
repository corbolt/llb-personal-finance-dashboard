import { href, type QueryValue } from "../lib/url";
import { localizePath, type Locale } from "./config";
import { createFormatters, type Formatters } from "./format";
import type { Catalog } from "./messages/types";
import { createTranslator, type Translator } from "./translate";

/**
 * Everything a component needs to speak the interface language.
 *
 * Server Components get it from `getI18n()` (`./server`), Client Components
 * from `useI18n()` (`./client`); both hand out this same object, so text
 * rendered on the server and during hydration is identical.
 */
export interface I18n {
  locale: Locale;
  /** Looks up a text: `t("budgets.left", { amount })`. */
  t: Translator;
  /** Dates and compact numbers. */
  format: Formatters;
  /** An address inside the app, in the current language: `link("/budgets", { m })`. */
  link(path: string, query?: Record<string, QueryValue>): string;
}

export function createI18n(locale: Locale, catalog: Catalog): I18n {
  const t = createTranslator(locale, catalog);
  return {
    locale,
    t,
    format: createFormatters(t),
    link: (path, query) => href(localizePath(locale, path), query),
  };
}

export type { Formatters } from "./format";
export type { Translator } from "./translate";
