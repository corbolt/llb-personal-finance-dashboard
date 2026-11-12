import { createElement, Fragment, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DEFAULT_CATEGORIES } from "../server/db/default-categories";
import {
  canonicalLocale,
  defaultLocale,
  isLocale,
  localeNames,
  locales,
  localizePath,
  negotiateLocale,
  switchLocalePath,
  type Locale,
} from "./config";
import { createI18n } from "./index";
import { i18nFor } from "./languages";
import { catalogs, type Catalog, type MessageKey } from "./messages";
import { categoryName, merchantName, withCategoryName } from "./names";

const en = i18nFor("en");
const de = i18nFor("de-LI");
const html = (node: ReactNode) => renderToStaticMarkup(createElement(Fragment, null, node));

type Entry = Catalog[keyof Catalog];
const kindOf = (entry: Entry) => (typeof entry === "string" ? "text" : Array.isArray(entry) ? "list" : "plural");
/** Every wording of an entry: the text, the list items, or the plural variants. */
const wordings = (entry: Entry): string[] =>
  typeof entry === "string" ? [entry] : Array.isArray(entry) ? [...entry] : Object.values(entry);
const placeholders = (entry: Entry) =>
  [...new Set(wordings(entry).flatMap((text) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1])))]
    .filter((name) => name !== "count") // a plural variant may leave the number out ("its only transaction")
    .sort();
const tags = (entry: Entry) =>
  [...new Set(wordings(entry).flatMap((text) => [...text.matchAll(/<(\w+)>/g)].map((match) => match[1])))].sort();

describe("catalogs", () => {
  const source = catalogs[defaultLocale];
  const keys = Object.keys(source) as Array<keyof Catalog>;
  const translations = locales.filter((locale) => locale !== defaultLocale);

  it("exist for every language, each with a name for the menu", () => {
    expect(Object.keys(catalogs).sort()).toEqual([...locales].sort());
    for (const locale of locales) expect(localeNames[locale]).toBeTruthy();
  });

  it.each(translations)("%s has the same entries as English, of the same kind", (locale) => {
    const catalog = catalogs[locale];
    expect(Object.keys(catalog).sort()).toEqual([...keys].sort());
    for (const key of keys) {
      expect(kindOf(catalog[key]), key).toBe(kindOf(source[key]));
      if (Array.isArray(source[key])) expect(catalog[key], key).toHaveLength(source[key].length);
    }
  });

  it.each(translations)("%s uses the placeholders and tags of the English text", (locale) => {
    const catalog = catalogs[locale];
    for (const key of keys) {
      expect(placeholders(catalog[key]), key).toEqual(placeholders(source[key]));
      expect(tags(catalog[key]), key).toEqual(tags(source[key]));
    }
  });

  it.each([...locales])("%s leaves nothing empty and closes every tag", (locale) => {
    const catalog = catalogs[locale];
    for (const key of keys) {
      for (const text of wordings(catalog[key])) {
        expect(text.trim(), key).not.toBe("");
        for (const tag of tags(text)) expect(text, key).toContain(`</${tag}>`);
      }
    }
  });

  it.each([...locales])("%s has a singular and a general variant for everything counted", (locale) => {
    const catalog = catalogs[locale];
    for (const key of keys) {
      const entry = catalog[key];
      if (kindOf(entry) === "plural") expect(Object.keys(entry).sort(), key).toEqual(["one", "other"]);
    }
  });

  it("de-LI is written the Liechtenstein way: ss for ß, guillemets for quotes", () => {
    const text = Object.values(catalogs["de-LI"]).flatMap(wordings).join("\n");
    expect(text).not.toMatch(/ß/);
    expect(text).not.toMatch(/[„“”"]/);
    expect(text).toContain("«Buchungsdatum»");
  });

  it("names every built-in category, in English exactly as it is stored", () => {
    for (const { slug, name } of DEFAULT_CATEGORIES) {
      const key = `category.${slug}` as MessageKey;
      expect(catalogs.en[key], key).toBe(name);
      for (const locale of locales) expect(catalogs[locale][key], `${locale} ${key}`).toBeTruthy();
    }
  });
});

describe("translator", () => {
  it("fills in placeholders", () => {
    expect(en.t("budgets.left", { amount: "CHF 20.00" })).toBe("CHF 20.00 left");
    expect(de.t("budgets.left", { amount: "CHF 20.00" })).toBe("CHF 20.00 übrig");
    expect(en.t("nav.overview")).toBe("Overview");
    expect(de.t("nav.overview")).toBe("Übersicht");
  });

  it("picks the wording for a count", () => {
    expect(en.t("count.transactions", { count: 1 })).toBe("1 transaction");
    expect(en.t("count.transactions", { count: 0 })).toBe("0 transactions");
    expect(en.t("count.transactions", { count: 12 })).toBe("12 transactions");
    expect(de.t("count.transactions", { count: 1 })).toBe("1 Buchung");
    expect(de.t("count.transactions", { count: 12 })).toBe("12 Buchungen");
    expect(de.t("categories.fromMerchants", { count: 3 })).toBe("von 3 Händlern");
    expect(en.t("import.allKnown", { count: 1 })).toBe("Its only transaction was already imported.");
  });

  it("builds a sentence from counted parts", () => {
    const note = (i18n: typeof en, count: number, rules: number) =>
      i18n.t("categories.deleteNote", {
        count,
        rules: rules > 0 ? i18n.t("categories.deleteRules", { count: rules }) : "",
      });
    expect(note(en, 4, 0)).toBe("Deleting leaves its 4 transactions uncategorised.");
    expect(note(en, 1, 2)).toBe("Deleting leaves its 1 transaction uncategorised and removes 2 rules.");
    expect(note(de, 4, 1)).toBe("Beim Löschen verlieren ihre 4 Buchungen die Kategorie und 1 Regel wird entfernt.");
  });

  it("puts elements into a text and lets tags wrap part of it", () => {
    const strong = (content: ReactNode) => createElement("strong", null, content);
    expect(html(en.t.rich("overview.uncategorised", { count: 2, b: strong }))).toBe(
      "<strong>2 transactions have</strong> no category yet. Assign one per merchant and it sticks for future imports.",
    );
    expect(html(de.t.rich("overview.uncategorised", { count: 1, b: strong }))).toMatch(
      /^<strong>1 Buchung hat<\/strong> noch keine Kategorie\./,
    );
    // an element as a value, placed where the language wants it
    const amount = createElement("b", null, "CHF 400.00");
    expect(html(en.t.rich("budgets.ofBudgeted", { amount }))).toBe("of <b>CHF 400.00</b> budgeted");
    expect(html(de.t.rich("budgets.ofBudgeted", { amount }))).toBe("von <b>CHF 400.00</b> budgetiert");
    expect(html(de.t.rich("rules.textContains", { text: "Miete", b: strong }))).toBe(
      "Buchungstext enthält <strong>«Miete»</strong>",
    );
  });

  it("words a failure reported by the server", () => {
    expect(en.t.error({ key: "error.categoryNameTaken", params: { name: "Hobbies" } })).toBe(
      "There is already a category called “Hobbies”.",
    );
    expect(de.t.error({ key: "error.categoryNameTaken", params: { name: "Hobbys" } })).toBe(
      "Es gibt bereits eine Kategorie namens «Hobbys».",
    );
    expect(de.t.error({ key: "error.fileTooLarge" })).toBe("Diese Datei ist grösser als 10 MB.");
  });

  it("shows the key rather than failing when a text is missing", () => {
    expect(en.t.dynamic("no.such.key" as MessageKey)).toBe("no.such.key");
    // and leaves a placeholder it was given nothing for
    expect(en.t.dynamic("budgets.left")).toBe("{amount} left");
  });

  it("checks keys and placeholders at compile time", () => {
    // @ts-expect-error — not a key
    en.t("nav.nowhere");
    // @ts-expect-error — the amount is missing
    en.t("budgets.left");
    // @ts-expect-error — wrong placeholder
    en.t("budgets.left", { sum: "CHF 1.00" });
    // @ts-expect-error — takes no placeholders
    en.t("nav.overview", { amount: "CHF 1.00" });
    // @ts-expect-error — a counted text needs its count
    en.t("review.done", {});
    // @ts-expect-error — an element is welcome, but the placeholder still has to be filled
    en.t.rich("budgets.ofBudgeted", {});
    // @ts-expect-error — the tag needs a renderer
    en.t.rich("rules.merchantIs", { merchant: "Coop" });
    // @ts-expect-error — a list is not a text
    en.t("date.months");
    expect(en.t.list("date.months")).toHaveLength(12);
  });
});

describe("formatters", () => {
  it("formats dates in English", () => {
    const { format } = en;
    expect(format.date("2026-09-29")).toBe("29 Sep 2026");
    expect(format.dayMonth("2026-11-01")).toBe("1 Nov");
    expect(format.dayHeading("2026-11-10")).toBe("Tue 10 Nov");
    expect(format.dayHeading("2025-12-31", "2026")).toBe("Wed 31 Dec 2025");
    expect(format.dayHeading("2026-12-31", "2026")).toBe("Thu 31 Dec");
    expect(format.month("2026-11")).toBe("November 2026");
    expect(format.monthName("2026-03")).toBe("March");
    expect(format.monthShort("2026-01")).toBe("Jan");
    expect(format.monthShort("2026-01", true)).toBe("Jan 26");
  });

  it("formats dates in German", () => {
    const { format } = de;
    expect(format.date("2026-09-29")).toBe("29. Sept. 2026");
    expect(format.date("2026-03-03")).toBe("3. März 2026");
    expect(format.dayMonth("2026-11-01")).toBe("1. Nov.");
    expect(format.dayHeading("2026-11-10")).toBe("Di., 10. Nov.");
    expect(format.dayHeading("2025-12-31", "2026")).toBe("Mi., 31. Dez. 2025");
    expect(format.month("2026-11")).toBe("November 2026");
    expect(format.monthName("2026-03")).toBe("März");
    expect(format.monthShort("2026-01", true)).toBe("Jan. 26");
  });

  it("describes days relative to today", () => {
    expect(en.format.relativeDay("2026-11-11", "2026-11-11")).toBe("today");
    expect(en.format.relativeDay("2026-11-12", "2026-11-11")).toBe("tomorrow");
    expect(en.format.relativeDay("2026-11-10", "2026-11-11")).toBe("yesterday");
    expect(en.format.relativeDay("2026-11-15", "2026-11-11")).toBe("in 4 days");
    expect(en.format.relativeDay("2026-11-08", "2026-11-11")).toBe("3 days ago");
    expect(de.format.relativeDay("2026-11-11", "2026-11-11")).toBe("heute");
    expect(de.format.relativeDay("2026-11-12", "2026-11-11")).toBe("morgen");
    expect(de.format.relativeDay("2026-11-15", "2026-11-11")).toBe("in 4 Tagen");
    expect(de.format.relativeDay("2026-11-08", "2026-11-11")).toBe("vor 3 Tagen");
  });

  it("labels axes in full below ten thousand and compactly above", () => {
    expect(en.format.axisValue(2500, 5000)).toBe("2’500");
    expect(en.format.axisValue(7500, 12500)).toBe("7.5K");
    expect(en.format.axisValue(-2500, 10000)).toBe("−2.5K");
    expect(en.format.axisValue(1500000, 2000000)).toBe("1.5M");
    expect(de.format.axisValue(2500, 5000)).toBe("2’500");
    expect(de.format.axisValue(7500, 12500)).toBe("7.5 Tsd.");
    expect(de.format.axisValue(1500000, 2000000)).toBe("1.5 Mio.");
  });

  it("builds addresses in its language", () => {
    expect(en.link("/")).toBe("/en");
    expect(de.link("/budgets")).toBe("/de-LI/budgets");
    expect(de.link("/transactions", { m: "2026-11", category: 5, q: "" })).toBe(
      "/de-LI/transactions?m=2026-11&category=5",
    );
    expect(de.link("/categories#review")).toBe("/de-LI/categories#review");
  });

  it("works the same from a catalog handed to the browser", () => {
    const client = createI18n("de-LI", JSON.parse(JSON.stringify(catalogs["de-LI"])) as Catalog);
    expect(client.t("count.transactions", { count: 2 })).toBe(de.t("count.transactions", { count: 2 }));
    expect(client.format.date("2026-09-29")).toBe(de.format.date("2026-09-29"));
  });
});

describe("choosing the language", () => {
  it("recognises its locales", () => {
    expect(isLocale("de-LI")).toBe(true);
    expect(isLocale("de-li")).toBe(false);
    expect(isLocale("fr")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
    expect(canonicalLocale("de-li")).toBe("de-LI");
    expect(canonicalLocale("EN")).toBe("en");
    expect(canonicalLocale("transactions")).toBeNull();
  });

  it("prefers the stored choice, then the browser, then English", () => {
    expect(negotiateLocale("de-LI", "en-US,en;q=0.9")).toBe("de-LI");
    expect(negotiateLocale(undefined, "de-LI,de;q=0.9,en;q=0.8")).toBe("de-LI");
    expect(negotiateLocale(undefined, "en-GB,en;q=0.9,de;q=0.8")).toBe("en");
    // any German is served by the one there is
    expect(negotiateLocale(undefined, "de-CH")).toBe("de-LI");
    expect(negotiateLocale(undefined, "fr-CH, de;q=0.7, en;q=0.9")).toBe("en");
    expect(negotiateLocale(undefined, "fr;q=1.0, de;q=0.5, en;q=0")).toBe("de-LI");
    expect(negotiateLocale(undefined, "fr-FR,it;q=0.8")).toBe("en");
    expect(negotiateLocale(undefined, null)).toBe("en");
    expect(negotiateLocale("klingon", "*")).toBe("en");
  });

  it("moves an address between languages", () => {
    const paths: Array<[string, Locale, string]> = [
      ["/en", "de-LI", "/de-LI"],
      ["/en/budgets", "de-LI", "/de-LI/budgets"],
      ["/de-LI/transactions/x", "en", "/en/transactions/x"],
      ["/budgets", "en", "/en/budgets"],
      ["/", "de-LI", "/de-LI"],
    ];
    for (const [from, to, expected] of paths) expect(switchLocalePath(from, to)).toBe(expected);
    expect(localizePath("en", "/")).toBe("/en");
    expect(localizePath("de-LI", "/import")).toBe("/de-LI/import");
  });
});

describe("names the app makes up", () => {
  it("shows a built-in category in the interface language until it is renamed", () => {
    const groceries = { name: "Groceries", slug: "groceries" };
    expect(categoryName(en.t, groceries)).toBe("Groceries");
    expect(categoryName(de.t, groceries)).toBe("Lebensmittel");
    // renamed by the user: theirs, in every language
    expect(categoryName(de.t, { name: "Food", slug: "groceries" })).toBe("Food");
    // created by the user
    expect(categoryName(de.t, { name: "Groceries", slug: null })).toBe("Groceries");
    expect(categoryName(de.t, { name: null, slug: null })).toBe("Ohne Kategorie");
    expect(categoryName(en.t, { name: null, slug: null })).toBe("Uncategorised");
  });

  it("keeps the stored name next to the shown one", () => {
    expect(withCategoryName(de.t, { id: 1, name: "Salary", slug: "salary" })).toEqual({
      id: 1,
      name: "Lohn",
      slug: "salary",
      storedName: "Salary",
    });
  });

  it("translates the merchants the importer invents, and only those", () => {
    expect(merchantName(de.t, { merchant: "Account transfer", merchantKey: "transfer" })).toBe("Kontoübertrag");
    expect(merchantName(de.t, { merchant: "Account closing", merchantKey: "closing" })).toBe("Kontoabschluss");
    expect(merchantName(en.t, { merchant: "Account transfer", merchantKey: "transfer" })).toBe("Account transfer");
    // a real shop that happens to share the key
    expect(merchantName(de.t, { merchant: "Transfer", merchantKey: "transfer" })).toBe("Transfer");
    expect(merchantName(de.t, { merchant: "Coop", merchantKey: "coop" })).toBe("Coop");
  });
});
