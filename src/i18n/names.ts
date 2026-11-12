import { DEFAULT_CATEGORIES } from "../server/db/default-categories";
import { GENERATED_MERCHANTS } from "../server/import/merchants";
import type { MessageKey } from "./messages/types";
import type { Translator } from "./translate";

/**
 * Display names for the things the app names itself.
 *
 * The database holds one fixed name for each built-in category and for the
 * merchants the importer makes up ("Account transfer"). They are data, so
 * they are stored once, in English; here they turn into the interface
 * language. A name the user has changed is theirs and is shown as it is.
 */

const BUILT_IN_CATEGORY_NAME = new Map(DEFAULT_CATEGORIES.map(({ slug, name }) => [slug, name]));

/**
 * A category's name: in the interface language while it still carries the
 * name it was created with, otherwise whatever the user called it. `null`
 * (no category) reads "Uncategorised".
 */
export function categoryName(t: Translator, category: { name: string | null; slug: string | null }): string {
  if (category.name === null) return t("common.uncategorised");
  if (category.slug !== null && BUILT_IN_CATEGORY_NAME.get(category.slug) === category.name) {
    return t.dynamic(`category.${category.slug}` as MessageKey);
  }
  return category.name;
}

/** `{ …category, name }` with the name as shown; the stored one is kept for saving it back unchanged. */
export function withCategoryName<Category extends { name: string; slug: string | null }>(
  t: Translator,
  category: Category,
): Category & { storedName: string } {
  return { ...category, name: categoryName(t, category), storedName: category.name };
}

const GENERATED_MERCHANT_KEY: Record<string, MessageKey> = {
  transfer: "merchant.transfer",
  closing: "merchant.closing",
  unknown: "merchant.unknown",
};

/** A merchant's name; the ones the importer made up follow the interface language. */
export function merchantName(t: Translator, merchant: { merchant: string; merchantKey: string }): string {
  const generated = GENERATED_MERCHANTS[merchant.merchantKey];
  // a shop that is really called "Transfer" has the same key but not the made-up name
  return generated !== undefined && generated === merchant.merchant
    ? t.dynamic(GENERATED_MERCHANT_KEY[merchant.merchantKey])
    : merchant.merchant;
}

/** `{ …row, merchant }` with the merchant's name as shown. */
export function withMerchantName<Row extends { merchant: string; merchantKey: string }>(
  t: Translator,
  row: Row,
): Row {
  return { ...row, merchant: merchantName(t, row) };
}
