import type { BookingKind } from "./booking-text";
import type { Brand } from "./merchants";
import { fold } from "./text";

/**
 * Automatic categorisation.
 *
 * Precedence, highest first:
 *   1. the user's own rules (set when they recategorise a merchant)
 *   2. what kind of booking it is (transfer, fee, cash withdrawal …)
 *   3. known brands
 *   4. keywords in the payment purpose
 *   5. keywords in the merchant name
 *
 * Anything that matches nothing stays uncategorised and shows up for review.
 * The built-in tables only return category slugs; user rules return ids.
 */

export interface UserRule {
  matchType: "merchant" | "text";
  /** Merchant key, or a folded text fragment. */
  pattern: string;
  categoryId: number;
}

export interface CategorisationInput {
  kind: BookingKind;
  /** Signed amount in minor units. */
  amount: number;
  merchantKey: string;
  merchantName: string;
  brand: Brand | null;
  memo: string | null;
  rawText: string;
}

export type CategorySource = "none" | "auto" | "rule";

export interface Categorisation {
  categoryId: number | null;
  source: CategorySource;
}

type KeywordRule = [pattern: RegExp, category: string];

/** Matched against the folded payment purpose of outgoing payments. */
const PURPOSE_KEYWORDS: KeywordRule[] = [
  [/\bmiete\b|\bmietzins|\bnebenkosten|\bhypothek/, "housing"],
  [/\bkindergeld|\balimente|\bunterhalt|\bkinderbetreuung|\bkita\b/, "kids"],
  [/\benthaarung|\bcoiffeur|\bfriseur|\bkosmetik|\bmassage/, "personal-care"],
  [/\bheizol|\bstromrechnung|\bwasserrechnung/, "utilities"],
  [/\bschulgeld|\bkursgeb|\bsemestergeb|\bkurskosten/, "education"],
  [/\bsteuern?\b|\bsteuerrechnung|\bordnungsbusse|\bbusse\b/, "taxes"],
  [/\bsaule 3a\b|\bvorsorge|\bsparplan/, "savings"],
  [/\bausgleich \S{0,12} ?konto\b|\bumbuchung|\beigenes konto/, "transfer"],
  [/\bausgleich kreditkarte|\bkreditkartenrechnung/, "credit-card"],
  [/\bpramie\b|\bpolice\b/, "insurance"],
  [/\bgeschenk|\bspende/, "gifts"],
];

/**
 * Matched against the folded merchant name. German builds compounds
 * ("Dorfmetzgerei", "Bahnhofapotheke", "Naturtierladen"), so distinctive stems
 * match anywhere in a word; only short, ambiguous ones are anchored with `\b`.
 */
const MERCHANT_KEYWORDS: KeywordRule[] = [
  [/steuerverwaltung|steueramt|landeskasse|gemeindekasse|zollamt|\bzoll\b|strassenverkehrsamt|motorfahrzeugkontrolle/, "taxes"],
  [/versicherung|krankenkasse|\binsurance|\bassurance/, "insurance"],
  [/tierarzt|tierladen|tierbedarf|tierheim|tiernahrung|tierfutter|zoohandlung|hundeschule|\bpfoten|\bpets?\b/, "pets"],
  [/apotheke|pharmac|farmacia|drogerie|zahnarzt|\barzt|praxis\b|\bdental|physio|\bspital\b|klinik|hospital|\boptik/, "health"],
  [/tankstelle|garage\b|autohaus|\bpneu|carwash|autowasch|waschanlage|parkhaus|\bparking\b|\btaxi\b/, "transport"],
  [/hotel|hostel|rasthaus|raststatte|flughafen|\bairport|camping|jugendherberge/, "travel"],
  [/coiffeur|coiffure|friseur|\bhair|barber|kosmetik|\bnails?\b|nagelstudio|wellness|massage/, "personal-care"],
  [/\bkita\b|kinderkrippe|kinderhort|spielgruppe|tagesstruktur|spielwaren|\btoys\b/, "kids"],
  [/ausbildung|schule\b|universit|weiterbildung|nachhilfe|\bakademie/, "education"],
  [/\bkino|cinema|theater|museum|konzert|fitness|\bgym\b|sportcenter|hallenbad|schwimmbad|freibad|minigolf|bowling|bergbahn|seilbahn|skilift/, "entertainment"],
  [/gartnerei|gartencenter|blumen|florist|\bgarten\b|\bgarden\b|baumarkt|mobel/, "home"],
  [/\bspende|stiftung\b|hilfswerk|\bcaritas\b|\brotes kreuz\b|\bwwf\b|\bgreenpeace\b|\bunicef\b/, "gifts"],
  [/kraftwerk|elektrizitat|wasserwerk|wasserversorgung|fernwarme|kehricht/, "utilities"],
  [/metzg|boucherie|b(a|ae)ckerei|konditorei|confiserie|dorfladen|hofladen|bioladen|kaserei|molkerei|lebensmittel|supermarkt|supermarket|getrankemarkt|\bbrot\b/, "groceries"],
  [/restaurant|ristorante|pizzeria|trattoria|osteria|gasthaus|gasthof|\bcafe\b|\bkaffee|\bbistro\b|\bbar\b|\bpub\b|imbiss|kebab|kebap|\bdoner|take ?away|\bkitchen\b|\bgrill|\bsushi|kulinarium|\bmensa\b|kantine|gelateria|brasserie|burger|\bpizza|steakhouse/, "dining"],
  [/\bschuhe|\bmode\b|boutique|\bfashion|buchhandlung|papeterie|juwelier|\buhren\b/, "shopping"],
];

/** Matched against the folded booking text of incoming payments. */
const INCOME_KEYWORDS: KeywordRule[] = [
  [/\bsalar|\blohn|\bgehalt|\bsalary|\bpayroll|\bwages/, "salary"],
  [/\bfamilienzulage|\bkinderzulage|\bkindergeld|\bahv\b|\brente\b|\bpension\b|\barbeitslosen|\btaggeld|\bstipendi/, "benefits"],
  [/\bruckerstattung|\bruckzahlung|\berstattung|\brefund|\bruckvergutung|\bstorno|\bretoure/, "refunds"],
  [/\bzins|\bdividende|\bcoupon\b/, "interest"],
];

function matchKeyword(rules: KeywordRule[], folded: string): string | null {
  for (const [pattern, category] of rules) {
    if (pattern.test(folded)) return category;
  }
  return null;
}

/** The built-in guess, as a category slug. */
export function builtInCategory(input: CategorisationInput): string | null {
  switch (input.kind) {
    case "transfer":
      return "transfer";
    case "fee":
      return "fees";
    case "closing":
      return input.amount > 0 ? "interest" : "fees";
    case "cash":
      return "cash";
    default:
      break;
  }

  const foldedName = fold(input.merchantName);
  const foldedMemo = input.memo ? fold(input.memo) : "";

  // Money coming in by bank transfer is income, not a negative expense.
  if (input.amount > 0 && input.kind !== "card") {
    const income = matchKeyword(INCOME_KEYWORDS, fold(input.rawText));
    if (income) return income;
    // insurers and health funds pay out reimbursements
    const payerCategory = input.brand?.category ?? matchKeyword(MERCHANT_KEYWORDS, foldedName);
    if (payerCategory === "insurance" || payerCategory === "health") return "refunds";
    return null;
  }

  if (input.brand?.category) return input.brand.category;
  if (foldedMemo) {
    const byPurpose = matchKeyword(PURPOSE_KEYWORDS, foldedMemo);
    if (byPurpose) return byPurpose;
  }
  return matchKeyword(MERCHANT_KEYWORDS, foldedName);
}

export interface CategoryLookup {
  /** Built-in category slug → id in this database. */
  idBySlug: ReadonlyMap<string, number>;
}

export function categorise(
  input: CategorisationInput,
  userRules: readonly UserRule[],
  lookup: CategoryLookup,
): Categorisation {
  const merchantRule = userRules.find(
    (rule) => rule.matchType === "merchant" && rule.pattern === input.merchantKey,
  );
  if (merchantRule) return { categoryId: merchantRule.categoryId, source: "rule" };

  const textRules = userRules.filter((rule) => rule.matchType === "text");
  if (textRules.length > 0) {
    const foldedText = fold(input.rawText);
    const textRule = textRules.find((rule) => rule.pattern !== "" && foldedText.includes(rule.pattern));
    if (textRule) return { categoryId: textRule.categoryId, source: "rule" };
  }

  const slug = builtInCategory(input);
  const categoryId = slug ? (lookup.idBySlug.get(slug) ?? null) : null;
  return categoryId === null
    ? { categoryId: null, source: "none" }
    : { categoryId, source: "auto" };
}
