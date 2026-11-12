import { notFound } from "next/navigation";
import { lang } from "next/root-params";

import { isLocale } from "./config";
import type { I18n } from "./index";
import { i18nFor } from "./languages";

/**
 * The interface language of the page being rendered, for Server Components.
 *
 * It is the `[lang]` segment every route sits under. That makes it a root
 * parameter, known while prerendering, so text from here is part of the
 * static shell. An address with an unknown language is a 404.
 *
 * Root parameters cannot be read in a Server Action; an action that needs the
 * language is told by its caller and uses `i18nFor()`.
 */
export async function getI18n(): Promise<I18n> {
  const locale = await lang();
  if (!isLocale(locale)) notFound();
  return i18nFor(locale);
}
