import type { ReactNode } from "react";

import type { en } from "./en";

/**
 * The shape of a catalog, derived from the English one: every language has
 * the same keys, and the placeholders written in the English text are what a
 * caller has to pass. Both are checked by the compiler; that a translation
 * uses the same placeholders as the English text is checked by a test.
 */
type Source = typeof en;

export type PluralCategory = "zero" | "one" | "two" | "few" | "many" | "other";

/** The variants of a counted message; which ones a language needs is up to its plural rule. */
export type PluralForms = { readonly other: string } & {
  readonly [Category in Exclude<PluralCategory, "other">]?: string;
};

type Widen<Entry> = Entry extends string
  ? string
  : Entry extends readonly string[]
    ? { readonly [Index in keyof Entry]: string }
    : PluralForms;

/** What a language file has to provide. */
export type Catalog = { readonly [Key in keyof Source]: Widen<Source[Key]> };

/** Keys of fixed lists, such as month names. */
export type ListKey = {
  [Key in keyof Source]: Source[Key] extends readonly string[] ? Key : never;
}[keyof Source];

/** Keys of texts. */
export type MessageKey = Exclude<keyof Source, ListKey>;

/** Keys of the messages the server reports failures with. */
export type ErrorKey = Extract<MessageKey, `error.${string}`>;

/** A failure as it travels from the server to the interface: named, not worded. */
export interface MessageError {
  key: ErrorKey;
  params?: Record<string, string | number>;
}

/* ---- what a message needs, read off its English text ---------------------- */

/** Every wording of an entry: the text itself, or all of its plural variants. */
type Wordings<Entry> = Entry extends string
  ? Entry
  : Entry extends readonly string[]
    ? never
    : Entry[keyof Entry];

/** `"{count} of {total}"` → `"count" | "total"` */
type Placeholders<Text> = Text extends `${string}{${infer Name}}${infer Rest}`
  ? Name | Placeholders<Rest>
  : never;

/** `"or <link>choose</link>"` → `"link"` */
type Tags<Text> = Text extends `${string}<${infer Name}>${infer Rest}`
  ? (Name extends `/${string}` ? never : Name) | Tags<Rest>
  : never;

/** Placeholders of a message; a counted one always takes `count`. */
type Names<Key extends MessageKey> =
  | Placeholders<Wordings<Source[Key]>>
  | (Source[Key] extends string ? never : "count");

export type Params<Key extends MessageKey> = {
  [Name in Names<Key>]: Name extends "count" ? number : string | number;
};

/** The arguments after the key: none for a message without placeholders. */
export type ParamArgs<Key extends MessageKey> = [Names<Key>] extends [never] ? [] : [params: Params<Key>];

/** Like `Params`, but placeholders may be elements and every tag gets a renderer. */
export type RichParams<Key extends MessageKey> = {
  [Name in Names<Key>]: Name extends "count" ? number : ReactNode;
} & {
  [Tag in Tags<Wordings<Source[Key]>>]: (content: ReactNode) => ReactNode;
};
