import { createElement, Fragment, type ReactNode } from "react";

import type { Locale } from "./config";
import type {
  Catalog,
  ListKey,
  MessageError,
  MessageKey,
  ParamArgs,
  PluralCategory,
  PluralForms,
  RichParams,
} from "./messages/types";

/**
 * Looks messages up in a catalog and fills in their placeholders.
 *
 * Written by hand rather than on top of `Intl.MessageFormat`/`PluralRules`:
 * like the money and date formatters, the same call has to produce the very
 * same text in Node.js and in the browser, whatever ICU data each ships.
 */
export interface Translator {
  /** Plain text: `t("budgets.left", { amount: "CHF 20.00" })`. */
  <Key extends MessageKey>(key: Key, ...params: ParamArgs<Key>): string;
  /**
   * Text with elements in it. A `{placeholder}` may be given an element, and
   * each `<tag>…</tag>` a function that wraps the text inside it.
   */
  rich<Key extends MessageKey>(key: Key, params: RichParams<Key>): ReactNode;
  /** A fixed list, such as the month names. */
  list<Key extends ListKey>(key: Key): Catalog[Key];
  /** For keys only known at run time; nothing checks the placeholders. */
  dynamic(key: MessageKey, params?: Record<string, string | number>): string;
  /** The text of a failure reported by the server. */
  error(error: MessageError): string;
}

/** Which plural variant a count takes. Whole numbers only — the app counts things. */
const PLURAL_RULES: Record<Locale, (count: number) => PluralCategory> = {
  en: (count) => (count === 1 ? "one" : "other"),
  "de-LI": (count) => (count === 1 ? "one" : "other"),
};

type Values = Record<string, unknown>;

const PLACEHOLDER = /\{(\w+)\}/g;
/** A placeholder, or a tag with everything up to its closing tag. */
const RICH_TOKEN = /\{(\w+)\}|<(\w+)>([\s\S]*?)<\/\2>/g;

function fill(text: string, values: Values | undefined): string {
  if (!values) return text;
  return text.replace(PLACEHOLDER, (placeholder, name: string) =>
    name in values ? String(values[name]) : placeholder,
  );
}

function fillRich(text: string, values: Values): ReactNode[] {
  const nodes: ReactNode[] = [];
  let end = 0;
  for (const token of text.matchAll(RICH_TOKEN)) {
    const [whole, placeholder, tag, inner] = token;
    if (token.index > end) nodes.push(text.slice(end, token.index));
    end = token.index + whole.length;

    const node: ReactNode =
      placeholder !== undefined
        ? placeholder in values
          ? (values[placeholder] as ReactNode)
          : whole
        : typeof values[tag] === "function"
          ? (values[tag] as (content: ReactNode) => ReactNode)(fillRich(inner, values))
          : fillRich(inner, values);
    // elements in a list need keys; strings and numbers do not
    nodes.push(typeof node === "object" ? createElement(Fragment, { key: nodes.length }, node) : node);
  }
  if (end < text.length) nodes.push(text.slice(end));
  return nodes;
}

export function createTranslator(locale: Locale, catalog: Catalog): Translator {
  const pluralCategory = PLURAL_RULES[locale];

  /** The wording for a key, with the plural variant picked but nothing filled in. */
  function wording(key: MessageKey, values: Values | undefined): string {
    const entry: string | PluralForms | undefined = catalog[key];
    // a key this catalog does not know (a page from another build): show the key
    if (entry === undefined) return key;
    if (typeof entry === "string") return entry;
    return entry[pluralCategory(Number(values?.count))] ?? entry.other;
  }

  const text = (key: MessageKey, values?: Values) => fill(wording(key, values), values);

  const translate = ((key: MessageKey, values?: Values) => text(key, values)) as Translator;
  translate.rich = (key: MessageKey, values: Values) => fillRich(wording(key, values), values);
  translate.list = (key) => catalog[key];
  translate.dynamic = text;
  translate.error = (error) => text(error.key, error.params);
  return translate;
}
