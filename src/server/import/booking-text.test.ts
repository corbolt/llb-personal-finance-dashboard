import { describe, expect, it } from "vitest";

import { parseBookingText } from "./booking-text";

describe("parseBookingText", () => {
  it("reads a card payment", () => {
    const details = parseBookingText(
      "Dorfbeck Muster, 09493 Mauren\n09.11.26 / 17:34:47\nKartennummer XXXX XXXX XXXX 2800",
    );
    expect(details).toEqual({
      kind: "card",
      counterparty: "Dorfbeck Muster",
      location: "Mauren",
      memo: null,
      cardLast4: "2800",
      purchaseDate: "2026-11-09",
      purchaseTime: "17:34:47",
    });
  });

  it("splits a card merchant at the last comma only", () => {
    const details = parseBookingText(
      "Muster's AG 04, Haag, 9469 Haag (Rheintal)\n01.10.26 / 10:00:00\nKartennummer XXXX XXXX XXXX 1234",
    );
    expect(details.counterparty).toBe("Muster's AG 04, Haag");
    expect(details.location).toBe("Haag");
  });

  it("tidies upper-case and placeholder locations", () => {
    const upper = parseBookingText(
      "RESTAURANT SONNE, 06800 FELDKIRCH\n08.11.26 / 18:45:49\nKartennummer XXXX XXXX XXXX 2792",
    );
    expect(upper.location).toBe("Feldkirch");

    const canton = parseBookingText(
      "IMBISS, 0947 BUCHS SG\n08.11.26 / 18:45:49\nKartennummer XXXX XXXX XXXX 2792",
    );
    expect(canton.location).toBe("Buchs SG");

    const truncated = parseBookingText(
      "Warenhaus AG, 0946 Haag (Rheinta\n08.11.26 / 18:45:49\nKartennummer XXXX XXXX XXXX 2792",
    );
    expect(truncated.location).toBe("Haag");
  });

  it("reads an e-banking payment with address, country and purpose", () => {
    const details = parseBookingText(
      [
        "E-Banking Zahlung",
        "Muster Immobilien AG",
        "Hauptstrasse 1",
        "9490 Vaduz",
        "Liechtenstein",
        "Miete Beispielweg 3",
        "",
        "Auftragsnummer: 857597995",
      ].join("\n"),
    );
    expect(details.kind).toBe("payment");
    expect(details.counterparty).toBe("Muster Immobilien AG");
    expect(details.memo).toBe("Miete Beispielweg 3");
    expect(details.location).toBeNull();
  });

  it("joins a purpose that wraps over several lines", () => {
    const details = parseBookingText(
      [
        "E-Banking Zahlung",
        "Max Muster",
        "Beispielweg 12",
        "9493 Mauren",
        "Liechtenstein",
        "Anteil Ferienwohnung",
        "Juli und August",
        "",
        "Auftragsnummer: 1",
      ].join("\n"),
    );
    expect(details.memo).toBe("Anteil Ferienwohnung Juli und August");
  });

  it("has no memo when the payment carries no purpose", () => {
    const details = parseBookingText(
      "E-Banking Zahlung\nTelco SA\nAvenue Exemple 2\n1008 Prilly\nSwitzerland\n\nAuftragsnummer: 860261108",
    );
    expect(details.counterparty).toBe("Telco SA");
    expect(details.memo).toBeNull();
  });

  it("does not mistake a purpose for the country line", () => {
    // "Italien" is a country name, but it comes after the address block ended
    const details = parseBookingText(
      "E-Banking Zahlung\nErika Beispiel\nSeeweg 4\n8000 Zürich\nSwitzerland\nItalien\n\nAuftragsnummer: 5",
    );
    expect(details.memo).toBe("Italien");
  });

  it("takes the merchant behind a LIPAY mobile payment", () => {
    const details = parseBookingText(
      "E-Banking Zahlung\nLIPAY\nBlumen Beispiel Anstalt\nRose\n\nAuftragsnummer: 859376889",
    );
    expect(details.kind).toBe("payment");
    expect(details.counterparty).toBe("Blumen Beispiel Anstalt");
    expect(details.memo).toBe("Rose");
  });

  it("reads a credit whose address has no country line", () => {
    const details = parseBookingText(
      "Gutschrift\nBEISPIEL SCHWEIZ AG\nBAHNHOFPLATZ 11 CH 4410 LIESTAL\nSalarzahlung\nAuftragsnummer: 855905168",
    );
    expect(details.kind).toBe("credit");
    expect(details.counterparty).toBe("BEISPIEL SCHWEIZ AG");
    expect(details.memo).toBe("Salarzahlung");
  });

  it("recognises transfers between own accounts", () => {
    const outgoing = parseBookingText("E-Banking Kontoübertrag\nAuftragsnummer: 860263313");
    expect(outgoing.kind).toBe("transfer");
    expect(outgoing.counterparty).toBe("Account transfer");
    expect(outgoing.memo).toBeNull();

    const incoming = parseBookingText(
      "E-Banking Kontoübertrag.\nIm Auftrag von Max oder Erika Muster, Mauren FL\nHeizöl\nAuftragsnummer: 860263736",
    );
    expect(incoming.kind).toBe("transfer");
    expect(incoming.memo).toBe("Heizöl");
  });

  it("recognises fees and the account closing", () => {
    const fee = parseBookingText(
      "Gebühren\nGebühr Debitkarte\nPeriode 01.07.2026-30.09.2026\nAuftragsnummer: 850770057",
    );
    expect(fee.kind).toBe("fee");
    expect(fee.counterparty).toBe("Gebühr Debitkarte");
    expect(fee.memo).toBe("Periode 01.07.2026-30.09.2026");

    const closing = parseBookingText(
      "Abschluss\nPeriode 30.06.2026-30.09.2026\nAuftragsnummer: 850843375",
    );
    expect(closing.kind).toBe("closing");
    expect(closing.counterparty).toBe("Account closing");
    expect(closing.memo).toBe("Periode 30.06.2026-30.09.2026");
  });

  it("recognises standing orders, direct debits and cash withdrawals by label", () => {
    expect(parseBookingText("Dauerauftrag\nMuster Immobilien AG\nMiete").kind).toBe("standing_order");
    expect(parseBookingText("Belastung LSV\nEnergie Beispiel AG").kind).toBe("direct_debit");
    expect(parseBookingText("Bancomat Bezug\nVaduz Städtle").kind).toBe("cash");
  });

  it("degrades gracefully for unknown shapes", () => {
    const unknown = parseBookingText("Sonderbuchung\nIrgendwer GmbH\nEtwas Text");
    expect(unknown.kind).toBe("other");
    expect(unknown.counterparty).toBe("Irgendwer GmbH");
    expect(unknown.memo).toBe("Etwas Text");

    const single = parseBookingText("Korrekturbuchung");
    expect(single.counterparty).toBe("Korrekturbuchung");

    expect(parseBookingText("").counterparty).toBe("Unknown");
  });
});
