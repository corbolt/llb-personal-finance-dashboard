import { describe, expect, it } from "vitest";

import { parseBookingText } from "./booking-text";
import { builtInCategory, categorise, type CategorisationInput, type UserRule } from "./categorize";
import { cardText, creditText, paymentText } from "./fixture";
import { normaliseMerchant } from "./merchants";

function inputFor(rawText: string, amount: number): CategorisationInput {
  const details = parseBookingText(rawText);
  const merchant = normaliseMerchant(details.counterparty, details.kind);
  return {
    kind: details.kind,
    amount: Math.round(amount * 100),
    merchantKey: merchant.key,
    merchantName: merchant.name,
    brand: merchant.brand,
    memo: details.memo,
    rawText,
  };
}

const card = (merchant: string, amount = -20) =>
  builtInCategory(inputFor(cardText(merchant, "9490 Vaduz", "2026-03-02T12:00:00"), amount));
const payment = (lines: string[], amount = -100) =>
  builtInCategory(inputFor(paymentText(lines), amount));
const credit = (lines: string[], amount = 100) =>
  builtInCategory(inputFor(creditText(lines), amount));

describe("builtInCategory", () => {
  it("categorises card payments at known brands", () => {
    expect(card("Coop-6272 Eschen Essane")).toBe("groceries");
    expect(card("Denner Satellit 9492 Esc")).toBe("groceries");
    expect(card("BP Tankstelle")).toBe("transport");
    expect(card("QUALIPET Center")).toBe("pets");
    expect(card("Manor AG")).toBe("shopping");
    expect(card("Jumbo-6063 Haag")).toBe("home");
    expect(card("Netflix.com")).toBe("entertainment");
    expect(card("MCDONALDS ZUERICH FLUG")).toBe("dining");
  });

  it("categorises unknown merchants by what their name says", () => {
    expect(card("Metzgerei Muster GmbH")).toBe("groceries");
    expect(card("DORFBAECKEREI BEISPIEL")).toBe("groceries");
    expect(card("Backerei Muster AG")).toBe("groceries");
    expect(card("Restaurant Sonne")).toBe("dining");
    expect(card("Bahnhof Apotheke Liestal")).toBe("health");
    expect(card("Centrum Drogerie")).toBe("health");
    expect(card("Naturtierladen")).toBe("pets");
    expect(card("Muster-Garage AG")).toBe("transport");
    expect(card("Zollamt Beispiel Au")).toBe("taxes");
    expect(card("Parkhotel Sonnenhof")).toBe("travel");
    expect(card("Coiffeur Chic")).toBe("personal-care");
  });

  it("leaves merchants it knows nothing about uncategorised", () => {
    expect(card("Muster Handels Anstalt")).toBeNull();
    expect(payment(["Erika Beispiel", "Seeweg 4", "9495 Triesen", "Liechtenstein", "2026-10-14 / 95"])).toBeNull();
  });

  it("reads the purpose of e-banking payments", () => {
    const address = ["Beispielweg 3", "9493 Mauren", "Liechtenstein"];
    expect(payment(["Max Muster", ...address, "Miete Beispielweg 3"])).toBe("housing");
    expect(payment(["Erika Beispiel", ...address, "Anteil Kindergeld abzügl. Krankenkasse"])).toBe("kids");
    expect(payment(["Erika Beispiel", ...address, "Enthaarung"])).toBe("personal-care");
    expect(payment(["Max Muster", "Berlin", "Germany", "Ausgleich DE-Konto"])).toBe("transfer");
  });

  it("prefers the brand over the purpose", () => {
    expect(
      payment(["Cembra Money Bank AG", "Postfach", "8048 Zürich", "Switzerland", "Ausgleich Kreditkarte"]),
    ).toBe("credit-card");
    expect(
      payment(["CONCORDIA", "Bundesplatz 15", "6002 Luzern", "Switzerland", "Abrechnungszeitraum: 01.11.2026 - 30.11.2026"]),
    ).toBe("insurance");
    expect(payment(["Swisscom (Schweiz) AG", "3050 Bern", "Switzerland"])).toBe("utilities");
  });

  it("treats incoming transfers as income", () => {
    expect(credit(["BEISPIEL SCHWEIZ AG", "BAHNHOFPLATZ 11 CH 4410 LIESTAL", "Salarzahlung"])).toBe("salary");
    expect(
      credit(["Liechtensteinische AHV", "Gerberweg 2", "9490 Vaduz", "Liechtenstein", "Familienzulagen;Periode 01.10.2026 - 31.10.2026;"]),
    ).toBe("benefits");
    // an insurer paying out is a reimbursement, not negative insurance spending
    expect(credit(["CONCORDIA Luzern", "Bundesplatz 15", "6003 Luzern", "Switzerland", "betrifft div. Abrechnungen"])).toBe("refunds");
    expect(credit(["Max Muster", "9490 Vaduz", "Liechtenstein", "Danke"])).toBeNull();
  });

  it("books a card refund against the spending category", () => {
    expect(card("Manor AG", 59.9)).toBe("shopping");
  });

  it("categorises by booking type where that says it all", () => {
    expect(builtInCategory(inputFor("E-Banking Kontoübertrag\nAuftragsnummer: 1", -800))).toBe("transfer");
    expect(builtInCategory(inputFor("Gebühren\nGebühr Debitkarte\nPeriode 01.07.2026-30.09.2026", -12))).toBe("fees");
    expect(builtInCategory(inputFor("Abschluss\nPeriode 30.06.2026-30.09.2026", -1.18))).toBe("fees");
    expect(builtInCategory(inputFor("Abschluss\nPeriode 30.06.2026-30.09.2026", 3.4))).toBe("interest");
    expect(builtInCategory(inputFor("Bancomat Bezug\nVaduz", -200))).toBe("cash");
  });
});

describe("categorise", () => {
  const lookup = { idBySlug: new Map([["groceries", 1], ["dining", 2], ["housing", 5]]) };
  const bakery = inputFor(cardText("Backerei Muster AG", "9490 Vaduz", "2026-03-02T08:00:00"), -6.5);

  it("maps the built-in guess to a category id", () => {
    expect(categorise(bakery, [], lookup)).toEqual({ categoryId: 1, source: "auto" });
  });

  it("lets a merchant rule override the built-in guess", () => {
    const rules: UserRule[] = [{ matchType: "merchant", pattern: bakery.merchantKey, categoryId: 2 }];
    expect(categorise(bakery, rules, lookup)).toEqual({ categoryId: 2, source: "rule" });
  });

  it("applies text rules to the folded booking text", () => {
    const rent = inputFor(
      paymentText(["Max Muster", "9493 Mauren", "Liechtenstein", "Zahlung Büro Äussere Gasse"]),
      -900,
    );
    const rules: UserRule[] = [{ matchType: "text", pattern: "buro aussere gasse", categoryId: 5 }];
    expect(categorise(rent, rules, lookup)).toEqual({ categoryId: 5, source: "rule" });
  });

  it("reports no category when nothing matches or the slug is unknown here", () => {
    const unknown = inputFor(cardText("Muster Handels Anstalt", "9490 Vaduz", "2026-03-02T08:00:00"), -5);
    expect(categorise(unknown, [], lookup)).toEqual({ categoryId: null, source: "none" });
    const pets = inputFor(cardText("QUALIPET Center", "9469 Haag", "2026-03-02T08:00:00"), -5);
    expect(categorise(pets, [], lookup)).toEqual({ categoryId: null, source: "none" });
  });
});
