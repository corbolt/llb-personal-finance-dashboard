import type { BookingKind } from "./booking-text";
import { collapseWhitespace, fold, isAllCaps, toTitleCase } from "./text";

/**
 * Turns the counterparty printed by the bank into a tidy merchant name and a
 * stable grouping key.
 *
 * Card descriptors are noisy: truncated at ~24 characters, upper-cased,
 * suffixed with branch numbers and towns ("Coop-6272 Eschen Essane",
 * "BURGER KING 14377 SOT"). Known brands are collapsed to one merchant so all
 * branches group together; everything else is only cleaned up cosmetically.
 */

export type Cadence =
  | "weekly"
  | "biweekly"
  | "monthly"
  | "quarterly"
  | "semiannual"
  | "yearly";

export interface Brand {
  name: string;
  /** Slug of the built-in category this merchant normally belongs to. */
  category: string | null;
  /** Set for merchants that bill on a schedule (subscriptions, telecom …). */
  cadence?: Cadence;
}

type BrandRule = [pattern: RegExp, name: string, category: string | null, cadence?: Cadence];

/**
 * Matched in order against the folded counterparty (lower-case ASCII, with
 * punctuation as spaces), so more specific entries must come first.
 */
const BRAND_RULES: BrandRule[] = [
  // — groceries & convenience —
  [/^coop pronto\b/, "Coop Pronto", "groceries"],
  [/^coop (bau|b h)\b/, "Coop Bau+Hobby", "home"],
  [/^coop vitality\b/, "Coop Vitality", "health"],
  [/^coop restaurant\b/, "Coop Restaurant", "dining"],
  [/^coop city\b/, "Coop City", "shopping"],
  [/^coop rechtsschutz\b/, "Coop Rechtsschutz", "insurance"],
  [/^coop mineral/, "Coop Mineraloel", "transport"],
  [/^coop\b/, "Coop", "groceries"],
  [/^migrolino\b/, "Migrolino", "groceries"],
  [/^migrol\b/, "Migrol", "transport"],
  [/^migros (restaurant|take ?away)\b/, "Migros Restaurant", "dining"],
  [/^migros ?bank\b/, "Migros Bank", null],
  [/^migros\b/, "Migros", "groceries"],
  [/^denner\b/, "Denner", "groceries"],
  [/^(euro|inter)?spar\b(?! und| kasse)/, "SPAR", "groceries"],
  [/^aldi\b/, "Aldi", "groceries"],
  [/^lidl\b/, "Lidl", "groceries"],
  [/^volg\b/, "Volg", "groceries"],
  [/^alnatura\b/, "Alnatura", "groceries"],
  [/^sutterl(ue|u)ty\b/, "Sutterlüty", "groceries"],
  [/^hofer\b/, "Hofer", "groceries"],
  [/^billa\b/, "Billa", "groceries"],
  [/^mpreis\b/, "MPreis", "groceries"],
  [/^penny\b/, "Penny", "groceries"],
  [/^rewe\b/, "Rewe", "groceries"],
  [/^edeka\b/, "Edeka", "groceries"],
  [/^kaufland\b/, "Kaufland", "groceries"],
  [/^k kiosk\b/, "k kiosk", "groceries"],
  [/^avec\b/, "avec", "groceries"],

  // — eating out —
  [/\bburger king\b/, "Burger King", "dining"],
  [/\bmc ?donald/, "McDonald's", "dining"],
  [/^kfc\b/, "KFC", "dining"],
  [/^subway\b/, "Subway", "dining"],
  [/\bstarbucks\b/, "Starbucks", "dining"],
  [/\bhans im gl(ue|u)ck\b/, "Hans im Glück", "dining"],
  [/^vapiano\b/, "Vapiano", "dining"],
  [/^nordsee\b/, "Nordsee", "dining"],
  [/^tibits\b/, "tibits", "dining"],
  [/^five guys\b/, "Five Guys", "dining"],
  [/\buber ?eats\b/, "Uber Eats", "dining"],
  [/^just ?eat\b|^eat ch\b/, "Just Eat", "dining"],
  [/^lieferando\b/, "Lieferando", "dining"],

  // — fuel, car, public transport —
  [/^bp\b/, "BP", "transport"],
  [/^esso\b/, "Esso", "transport"],
  [/^shell\b/, "Shell", "transport"],
  [/^avia\b/, "AVIA", "transport"],
  [/^agrola\b/, "Agrola", "transport"],
  [/^socar\b/, "SOCAR", "transport"],
  [/^eni\b/, "Eni", "transport"],
  [/^omv\b/, "OMV", "transport"],
  [/^tamoil\b/, "Tamoil", "transport"],
  [/^aral\b/, "Aral", "transport"],
  [/^total ?energies\b|^total\b/, "TotalEnergies", "transport"],
  [/\bruedi r(ue|u)ssel\b/, "Ruedi Rüssel", "transport"],
  [/^sbb\b/, "SBB", "transport"],
  [/^(oe|o)bb\b/, "ÖBB", "transport"],
  [/^db (bahn|vertrieb|fernverkehr)\b|^deutsche bahn\b/, "Deutsche Bahn", "transport"],
  [/\bbvg\b/, "BVG", "transport"],
  [/^zvv\b/, "ZVV", "transport"],
  [/^postauto\b/, "PostAuto", "transport"],
  [/^lie ?mobil\b/, "LIEmobil", "transport"],
  [/^flixbus\b|^flix\b/, "FlixBus", "transport"],
  [/^uber\b/, "Uber", "transport"],
  [/^amag\b/, "AMAG", "transport"],
  [/^emil frey\b/, "Emil Frey", "transport"],
  [/^tcs\b/, "TCS", "transport"],
  [/^easypark\b|^parkingpay\b/, "Parking", "transport"],

  // — travel —
  [/^booking com\b/, "Booking.com", "travel"],
  [/^airbnb\b/, "Airbnb", "travel"],
  [/^swiss (international )?air\b/, "SWISS", "travel"],
  [/^lufthansa\b/, "Lufthansa", "travel"],
  [/^easyjet\b/, "easyJet", "travel"],
  [/^ryanair\b/, "Ryanair", "travel"],
  [/^austrian air/, "Austrian Airlines", "travel"],
  [/^eurowings\b/, "Eurowings", "travel"],

  // — health & insurance —
  [/^amavita\b/, "Amavita", "health"],
  [/^sun ?store\b/, "Sun Store", "health"],
  [/^fielmann\b/, "Fielmann", "health"],
  [/^concordia\b/, "Concordia", "insurance", "monthly"],
  [/^css\b/, "CSS", "insurance", "monthly"],
  [/^helsana\b/, "Helsana", "insurance", "monthly"],
  [/^swica\b/, "SWICA", "insurance", "monthly"],
  [/^sanitas\b/, "Sanitas", "insurance", "monthly"],
  [/^visana\b/, "Visana", "insurance", "monthly"],
  [/^groupe mutuel\b/, "Groupe Mutuel", "insurance", "monthly"],
  [/^kpt\b/, "KPT", "insurance", "monthly"],
  [/^assura\b/, "Assura", "insurance", "monthly"],
  [/^sympany\b/, "Sympany", "insurance", "monthly"],
  [/^(oe|o)kk\b/, "ÖKK", "insurance", "monthly"],
  [/^atupri\b/, "Atupri", "insurance", "monthly"],
  [/^fkb\b/, "FKB", "insurance", "monthly"],
  [/^(die |schweizerische )?mobiliar\b/, "Die Mobiliar", "insurance"],
  [/^axa\b/, "AXA", "insurance"],
  [/^helvetia\b/, "Helvetia", "insurance"],
  [/^allianz\b/, "Allianz", "insurance"],
  [/^generali\b/, "Generali", "insurance"],
  [/^baloise\b|^basler vers/, "Baloise", "insurance"],
  [/^vaudoise\b/, "Vaudoise", "insurance"],
  [/^swiss ?life\b/, "Swiss Life", "insurance"],

  // — telecom & utilities —
  [/^swisscom\b/, "Swisscom", "utilities", "monthly"],
  [/^salt( mobile\b| sa\b|$)/, "Salt", "utilities", "monthly"],
  [/^sunrise\b/, "Sunrise", "utilities", "monthly"],
  [/^upc\b/, "UPC", "utilities", "monthly"],
  [/^telecom liechtenstein\b|^fl1\b/, "Telecom Liechtenstein", "utilities", "monthly"],
  [/^tv com\b/, "TV-COM", "utilities"],
  [/^quickline\b/, "Quickline", "utilities", "monthly"],
  [/^wingo\b/, "Wingo", "utilities", "monthly"],
  [/^yallo\b/, "yallo", "utilities", "monthly"],
  [/^serafe\b/, "Serafe", "utilities", "yearly"],
  [/^lkw\b|^liechtensteinische kraftwerke\b/, "LKW", "utilities"],
  [/^liechtensteinische gasversorgung\b|^lgv\b/, "LGV", "utilities"],

  // — shopping —
  [/^manor\b/, "Manor", "shopping"],
  [/^globus\b/, "Globus", "shopping"],
  [/^h m( hennes| \d|$)|^hennes\b/, "H&M", "shopping"],
  [/^zara\b/, "Zara", "shopping"],
  [/^c a( mode| \d|$)/, "C&A", "shopping"],
  [/^dosenbach\b/, "Dosenbach", "shopping"],
  [/^ochsner\b/, "Ochsner", "shopping"],
  [/^decathlon\b/, "Decathlon", "shopping"],
  [/^zalando\b/, "Zalando", "shopping"],
  [/^amazon prime\b|^prime video\b/, "Amazon Prime", "entertainment", "monthly"],
  [/^amazon\b|^amzn\b/, "Amazon", "shopping"],
  [/^galaxus\b/, "Galaxus", "shopping"],
  [/^digitec\b/, "Digitec", "shopping"],
  [/^brack\b/, "Brack", "shopping"],
  [/^interdiscount\b/, "Interdiscount", "shopping"],
  [/^fust\b/, "Fust", "shopping"],
  [/^media ?markt\b/, "MediaMarkt", "shopping"],
  [/^otto s\b/, "Otto's", "shopping"],
  [/^action\b/, "Action", "shopping"],
  [/^tedi\b/, "TEDi", "shopping"],
  [/^ricardo\b/, "Ricardo", "shopping"],
  [/^aliexpress\b/, "AliExpress", "shopping"],
  [/^temu\b/, "Temu", "shopping"],
  [/^shein\b/, "SHEIN", "shopping"],
  [/^klarna\b/, "Klarna", "shopping"],
  [/^paypal\b/, "PayPal", null],
  [/^post ch\b|^die post\b|^swiss post\b/, "Swiss Post", "shopping"],
  [/^dm (drogerie|markt)\b/, "dm", "personal-care"],
  [/^rossmann\b/, "Rossmann", "personal-care"],
  [/^douglas\b/, "Douglas", "personal-care"],

  // — home & garden —
  [/^jumbo\b/, "Jumbo", "home"],
  [/^hornbach\b/, "Hornbach", "home"],
  [/^bauhaus\b/, "Bauhaus", "home"],
  [/^obi\b/, "OBI", "home"],
  [/^ikea\b/, "IKEA", "home"],
  [/^jysk\b/, "JYSK", "home"],
  [/^landi\b/, "Landi", "home"],
  [/^micasa\b/, "Micasa", "home"],
  [/^conforama\b/, "Conforama", "home"],

  // — pets —
  [/^qualipet\b/, "Qualipet", "pets"],
  [/^fressnapf\b/, "Fressnapf", "pets"],
  [/^zooplus\b/, "zooplus", "pets"],

  // — streaming, software, entertainment —
  [/^netflix\b/, "Netflix", "entertainment", "monthly"],
  [/^spotify\b/, "Spotify", "entertainment", "monthly"],
  [/^disney\b/, "Disney+", "entertainment", "monthly"],
  [/^youtube\b|^google youtube\b/, "YouTube", "entertainment", "monthly"],
  [/^dazn\b/, "DAZN", "entertainment", "monthly"],
  [/^audible\b/, "Audible", "entertainment", "monthly"],
  [/^apple com bill\b|^itunes\b|^apple\b/, "Apple", "software"],
  [/^google\b/, "Google", "software"],
  [/^microsoft\b|^msft\b/, "Microsoft", "software"],
  [/^adobe\b/, "Adobe", "software", "monthly"],
  [/^openai\b|^chatgpt\b/, "OpenAI", "software", "monthly"],
  [/^anthropic\b|^claude ai\b/, "Anthropic", "software", "monthly"],
  [/^github\b/, "GitHub", "software", "monthly"],
  [/^dropbox\b/, "Dropbox", "software", "monthly"],
  [/^1password\b/, "1Password", "software"],
  [/^proton\b/, "Proton", "software"],
  [/^playstation\b|^sony playstation\b/, "PlayStation", "entertainment"],
  [/^nintendo\b/, "Nintendo", "entertainment"],
  [/^steam ?games\b|^steam\b/, "Steam", "entertainment"],
  [/^ticketcorner\b/, "Ticketcorner", "entertainment"],
  [/^eventim\b/, "Eventim", "entertainment"],

  // — card issuers, savings —
  [/^cembra\b/, "Cembra", "credit-card"],
  [/^viseca\b|^one viseca\b/, "Viseca", "credit-card"],
  [/^swisscard\b/, "Swisscard", "credit-card"],
  [/^cornercard\b|^corner ban/, "Cornèrcard", "credit-card"],
  [/^bonuscard\b/, "BonusCard", "credit-card"],
  [/^american express\b|^amex\b/, "American Express", "credit-card"],
  [/^viac\b/, "VIAC", "savings"],
  [/^frankly\b/, "frankly", "savings"],
  [/^finpension\b/, "finpension", "savings"],
  [/^true wealth\b/, "True Wealth", "savings"],
];

const BRANDS_BY_KEY = new Map<string, Brand>();
for (const [, name, category, cadence] of BRAND_RULES) {
  BRANDS_BY_KEY.set(fold(name), { name, category, cadence });
}

export function findBrand(counterparty: string): Brand | null {
  const folded = fold(counterparty);
  for (const [pattern, name, category, cadence] of BRAND_RULES) {
    if (pattern.test(folded)) return { name, category, cadence };
  }
  return null;
}

/** Looks a brand up by the merchant key that `normaliseMerchant` produced. */
export function brandForKey(merchantKey: string): Brand | null {
  return BRANDS_BY_KEY.get(merchantKey) ?? null;
}

export interface Merchant {
  /** Display name. */
  name: string;
  /** Grouping key: equal for every booking of the same merchant. */
  key: string;
  brand: Brand | null;
}

/**
 * Payment facilitators prefix the real merchant: `SumUp *Corner Cafe`,
 * `NYX*Hotel Sonne`, `PAYPAL *SPOTIFY`. The part after the asterisk is the
 * shop the customer actually dealt with.
 */
function stripFacilitator(name: string): string {
  const star = name.lastIndexOf("*");
  if (star < 0) return name;
  const tail = collapseWhitespace(name.slice(star + 1));
  return /\p{L}{2,}/u.test(tail) ? tail : name;
}

function prettify(raw: string): string {
  let name = collapseWhitespace(stripFacilitator(raw));
  // drop a trailing branch or terminal number
  name = name.replace(/\s+\d{3,}$/, "");
  if (isAllCaps(name)) name = toTitleCase(name);
  // card networks drop apostrophes: "Rosie S Kitchen" → "Rosie's Kitchen"
  name = name.replace(/(\p{L}{2,}) [sS] (?=\p{L})/gu, "$1's ");
  return name || collapseWhitespace(raw);
}

export function normaliseMerchant(counterparty: string, kind: BookingKind): Merchant {
  if (kind === "transfer") {
    return { name: "Account transfer", key: "transfer", brand: null };
  }
  if (kind === "closing") {
    return { name: "Account closing", key: "closing", brand: null };
  }
  if (kind === "fee") {
    const name = collapseWhitespace(counterparty);
    return { name, key: `fee ${fold(name)}`, brand: null };
  }

  // The shop behind a facilitator wins over the facilitator itself, so
  // "PAYPAL *SPOTIFY" is Spotify; "AMZN Mktp*2X3AB45" still falls back to Amazon.
  const brand = findBrand(stripFacilitator(counterparty)) ?? findBrand(counterparty);
  if (brand) return { name: brand.name, key: fold(brand.name), brand };

  const name = prettify(counterparty);
  return { name, key: fold(name) || fold(counterparty) || "unknown", brand: null };
}
