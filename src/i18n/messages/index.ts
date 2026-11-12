import type { Locale } from "../config";
import { deLI } from "./de-LI";
import { en } from "./en";
import type { Catalog } from "./types";

export type * from "./types";

/** Every language's texts. A locale without an entry here does not compile. */
export const catalogs: Record<Locale, Catalog> = {
  en,
  "de-LI": deLI,
};
