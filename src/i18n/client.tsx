"use client";

import { createContext, use, useMemo, type ReactNode } from "react";

import type { Locale } from "./config";
import { createI18n, type I18n } from "./index";
import type { Catalog } from "./messages/types";

const I18nContext = createContext<I18n | null>(null);

/**
 * Hands the page's language to Client Components. The root layout passes the
 * catalog of that one language, so the browser never loads the others.
 */
export function I18nProvider({
  locale,
  messages,
  children,
}: {
  locale: Locale;
  messages: Catalog;
  children: ReactNode;
}) {
  const value = useMemo(() => createI18n(locale, messages), [locale, messages]);
  return <I18nContext value={value}>{children}</I18nContext>;
}

/** The interface language, for Client Components. */
export function useI18n(): I18n {
  const value = use(I18nContext);
  if (!value) throw new Error("useI18n() needs the <I18nProvider> of the root layout above it.");
  return value;
}
