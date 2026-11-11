/** Small text helpers shared by the import pipeline. */

/**
 * Lower-cases, strips diacritics (ä → a, é → e, ß → ss) and turns every run
 * of punctuation into a single space. Used for matching, never for display.
 */
export function fold(input: string): string {
  return input
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .replace(/ß/g, "ss")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function collapseWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

export function isAllCaps(input: string): boolean {
  return /\p{Lu}/u.test(input) && !/\p{Ll}/u.test(input);
}

const LEGAL_FORMS: Record<string, string> = {
  ag: "AG",
  gmbh: "GmbH",
  sa: "SA",
  kg: "KG",
  ab: "AB",
  bv: "BV",
  llc: "LLC",
  ltd: "Ltd",
  inc: "Inc",
  ev: "e.V.",
};

/** `RESTAURANT YUMMY AG` → `Restaurant Yummy AG` */
export function toTitleCase(input: string): string {
  return input
    .toLowerCase()
    .replace(/(^|[\s\-/(.&+])(\p{L})/gu, (_, lead: string, letter: string) => lead + letter.toUpperCase())
    .replace(/(?<=\s)\p{L}+$/u, (word) => LEGAL_FORMS[word.toLowerCase()] ?? word);
}
