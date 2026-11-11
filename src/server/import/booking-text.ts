import { collapseWhitespace, isAllCaps, toTitleCase } from "./text";

/**
 * Parses the multi-line "Buchungstext" of an LLB booking.
 *
 * Shapes seen in exports:
 *
 *   Card payment            E-banking payment           Credit
 *   ------------            -----------------           ------
 *   Merchant, 9492 City     E-Banking Zahlung           Gutschrift
 *   09.11.26 / 17:34:47     Payee name                  Payer name
 *   Kartennummer XXXX ..    Street 1                    Address…
 *                           9492 City                   Purpose
 *                           Country                     Auftragsnummer: 123
 *                           Purpose line(s)
 *                           <blank>
 *                           Auftragsnummer: 123
 *
 * plus account transfers, fees and the periodic account closing. Anything
 * unrecognised still yields a usable counterparty and memo.
 */

export type BookingKind =
  | "card"
  | "payment"
  | "credit"
  | "transfer"
  | "fee"
  | "closing"
  | "standing_order"
  | "direct_debit"
  | "cash"
  | "other";

export interface BookingDetails {
  kind: BookingKind;
  /** Counterparty as printed by the bank (merchant, payee or payer). */
  counterparty: string;
  /** Town of a card purchase. */
  location: string | null;
  /** Payment purpose / message. */
  memo: string | null;
  cardLast4: string | null;
  /** Day of the card purchase (`YYYY-MM-DD`), which precedes the booking. */
  purchaseDate: string | null;
  purchaseTime: string | null;
}

const CARD_NUMBER = /^Kartennummer\b.*?(\d{4})\s*$/i;
const CARD_TIMESTAMP = /^(\d{2})\.(\d{2})\.(\d{2}|\d{4})\s*\/\s*(\d{2}):(\d{2})(?::(\d{2}))?$/;
const ORDER_NUMBER = /^Auftragsnummer\s*:/i;
const ON_BEHALF_OF = /^Im Auftrag von\b/i;

const KIND_BY_LABEL: Array<[RegExp, BookingKind]> = [
  [/konto(ü|ue|u)bertrag|umbuchung|account transfer/i, "transfer"],
  [/^geb(ü|ue|u)hr|^spesen|^fees?\b/i, "fee"],
  [/^abschluss|^closing|^zinsabschluss/i, "closing"],
  [/dauerauftrag|standing order/i, "standing_order"],
  [/\blsv\b|lastschrift|direct debit|ebill/i, "direct_debit"],
  [/bancomat|bargeld|geldautomat|\batm\b/i, "cash"],
  [/^gutschrift|zahlungseingang|^verg(ü|ue|u)tung|^credit\b/i, "credit"],
  [/zahlung|payment|belastung/i, "payment"],
];

const COUNTRY_NAMES: ReadonlySet<string> = buildCountryNames();

function buildCountryNames(): Set<string> {
  const names = new Set<string>();
  for (const locale of ["en", "de", "fr", "it"]) {
    const display = new Intl.DisplayNames([locale], { type: "region", fallback: "none" });
    for (let a = 65; a <= 90; a++) {
      for (let b = 65; b <= 90; b++) {
        const name = display.of(String.fromCharCode(a, b));
        if (name) names.add(name.toLowerCase());
      }
    }
  }
  for (const extra of [
    "czech republic",
    "great britain",
    "holland",
    "the netherlands",
    "russia",
    "south korea",
    "turkey",
    "uk",
    "united states of america",
    "usa",
  ]) {
    names.add(extra);
  }
  return names;
}

function isCountry(line: string): boolean {
  return COUNTRY_NAMES.has(line.toLowerCase());
}

/** Street-and-number or postcode-and-town lines, used when no country line exists. */
function looksLikeAddress(line: string): boolean {
  if (/\b\d{4,5}\s+\p{L}/u.test(line)) return true;
  if (/(strasse|straße|str\.|gasse|platz|allee|postfach|avenue|\brue\b|\bvia\b|chemin|route)/i.test(line)) {
    return true;
  }
  return /^\p{L}[\p{L}\s.'’-]*\s\d{1,4}[a-z]?$/iu.test(line);
}

const CANTON_SUFFIX =
  /\s(zh|be|lu|ur|sz|ow|nw|gl|zg|fr|so|bs|bl|sh|ar|ai|sg|gr|ag|tg|ti|vd|vs|ne|ge|ju|fl)$/i;

/** `09493 Mauren` → `Mauren`, `06800 FELDKIRCH` → `Feldkirch`, `0947 BUCHS SG` → `Buchs SG` */
function cleanLocation(raw: string): string | null {
  let town = raw.replace(/^\d{3,5}\s+/, "").replace(/\s*\(.*$/, "");
  town = collapseWhitespace(town);
  if (town === "" || /^\d+$/.test(town)) return null;
  if (!isAllCaps(town)) return town;
  return toTitleCase(town).replace(CANTON_SUFFIX, (suffix) => suffix.toUpperCase());
}

function joinMemo(lines: string[]): string | null {
  const memo = collapseWhitespace(lines.join(" "));
  return memo === "" ? null : memo;
}

export function parseBookingText(text: string): BookingDetails {
  const lines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => collapseWhitespace(line))
    .filter((line) => line !== "" && !ORDER_NUMBER.test(line));

  const details: BookingDetails = {
    kind: "other",
    counterparty: lines[0] ?? "Unknown",
    location: null,
    memo: null,
    cardLast4: null,
    purchaseDate: null,
    purchaseTime: null,
  };
  if (lines.length === 0) return details;

  const cardLine = lines.find((line) => CARD_NUMBER.test(line));
  if (cardLine) {
    details.kind = "card";
    details.cardLast4 = CARD_NUMBER.exec(cardLine)![1];

    const head = lines[0];
    const comma = head.lastIndexOf(", ");
    if (comma > 0) {
      details.counterparty = head.slice(0, comma);
      details.location = cleanLocation(head.slice(comma + 2));
    }

    for (const line of lines) {
      const stamp = CARD_TIMESTAMP.exec(line);
      if (!stamp) continue;
      const year = stamp[3].length === 2 ? `20${stamp[3]}` : stamp[3];
      details.purchaseDate = `${year}-${stamp[2]}-${stamp[1]}`;
      details.purchaseTime = `${stamp[4]}:${stamp[5]}:${stamp[6] ?? "00"}`;
      break;
    }
    return details;
  }

  const label = lines[0].replace(/\.$/, "");
  const body = lines.slice(1);
  details.kind = KIND_BY_LABEL.find(([pattern]) => pattern.test(label))?.[1] ?? "other";

  switch (details.kind) {
    case "transfer": {
      details.counterparty = "Account transfer";
      details.memo = joinMemo(body.filter((line) => !ON_BEHALF_OF.test(line)));
      return details;
    }
    case "closing": {
      details.counterparty = "Account closing";
      details.memo = joinMemo(body);
      return details;
    }
    case "fee": {
      details.counterparty = body[0] ?? label;
      details.memo = joinMemo(body.slice(1));
      return details;
    }
    default: {
      if (body.length === 0) {
        details.counterparty = label;
        return details;
      }
      // Mobile payments are routed through LIPAY; the merchant follows it.
      if (/^lipay$/i.test(body[0]) && body.length > 1) {
        details.counterparty = body[1];
        details.memo = joinMemo(body.slice(2));
        return details;
      }

      details.counterparty = body[0];
      const rest = body.slice(1);
      // The address block ends with a country line when the bank knows it.
      const countryIndex = rest.slice(0, 4).findIndex(isCountry);
      if (countryIndex >= 0) {
        details.memo = joinMemo(rest.slice(countryIndex + 1));
      } else {
        let firstPurposeLine = 0;
        while (firstPurposeLine < rest.length && looksLikeAddress(rest[firstPurposeLine])) {
          firstPurposeLine += 1;
        }
        details.memo = joinMemo(rest.slice(firstPurposeLine));
      }
      return details;
    }
  }
}
