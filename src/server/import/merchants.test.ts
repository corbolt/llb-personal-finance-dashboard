import { describe, expect, it } from "vitest";

import { brandForKey, normaliseMerchant } from "./merchants";

describe("normaliseMerchant", () => {
  it("collapses the branches of a chain into one merchant", () => {
    const variants = ["Coop-6272 Eschen Essane", "Coop-6079 Eschen", "COOP-6271 RUGGELL"];
    const merchants = variants.map((raw) => normaliseMerchant(raw, "card"));
    expect(new Set(merchants.map((m) => m.key))).toEqual(new Set(["coop"]));
    expect(merchants[0].name).toBe("Coop");
    expect(merchants[0].brand?.category).toBe("groceries");
  });

  it("keeps sub-brands of a chain apart", () => {
    expect(normaliseMerchant("Coop Pronto 3447", "card").name).toBe("Coop Pronto");
    expect(normaliseMerchant("COOP VITALITY-5576 Haag", "card").brand?.category).toBe("health");
    expect(normaliseMerchant("Migrol Tankstelle", "card").brand?.category).toBe("transport");
    expect(normaliseMerchant("Migros TA Liestal", "card").name).toBe("Migros");
  });

  it("recognises brands inside noisy descriptors", () => {
    expect(normaliseMerchant("BURGER KING 14377 SOT", "card").name).toBe("Burger King");
    expect(normaliseMerchant("Burger King - Dribuchs S", "card").key).toBe("burger king");
    expect(normaliseMerchant("SBB CFF FFS Mobile Ticke", "card").name).toBe("SBB");
    expect(normaliseMerchant("Netflix.com", "card").brand?.cadence).toBe("monthly");
    expect(normaliseMerchant("Hans im Gluck Burgergril", "card").name).toBe("Hans im Glück");
    expect(normaliseMerchant("Salt Mobile SA", "payment").name).toBe("Salt");
    expect(normaliseMerchant("TV-COM AG", "payment").name).toBe("TV-COM");
  });

  it("looks through payment facilitators", () => {
    expect(normaliseMerchant("Riverty Bank SA*BVG", "card").name).toBe("BVG");
    expect(normaliseMerchant("SumUp  *Corner s cafe", "card").name).toBe("Corner's cafe");
    expect(normaliseMerchant("PAYPAL *SPOTIFY", "card").name).toBe("Spotify");
  });

  it("tidies unknown merchants without renaming them", () => {
    expect(normaliseMerchant("RESTAURANT SONNE", "card").name).toBe("Restaurant Sonne");
    expect(normaliseMerchant("BEISPIEL SCHWEIZ AG", "credit").name).toBe("Beispiel Schweiz AG");
    expect(normaliseMerchant("ROSIE S KITCHEN", "card").name).toBe("Rosie's Kitchen");
    expect(normaliseMerchant("Muster GmbH & Co. KG", "card").name).toBe("Muster GmbH & Co. KG");
    expect(normaliseMerchant("Hofladen Beispiel 00412", "card").name).toBe("Hofladen Beispiel");
  });

  it("gives every spelling of an unknown merchant the same key", () => {
    const a = normaliseMerchant("Metzgerei Muster GmbH", "card");
    const b = normaliseMerchant("METZGEREI MUSTER GMBH", "card");
    expect(a.key).toBe("metzgerei muster gmbh");
    expect(b.key).toBe(a.key);
  });

  it("uses fixed merchants for transfers, fees and closings", () => {
    expect(normaliseMerchant("Account transfer", "transfer")).toMatchObject({
      name: "Account transfer",
      key: "transfer",
    });
    expect(normaliseMerchant("Account closing", "closing").key).toBe("closing");
    expect(normaliseMerchant("Gebühr Debitkarte", "fee")).toMatchObject({
      name: "Gebühr Debitkarte",
      key: "fee gebuhr debitkarte",
    });
  });

  it("finds a brand again from its key", () => {
    const merchant = normaliseMerchant("Swisscom (Schweiz) AG", "payment");
    expect(brandForKey(merchant.key)?.cadence).toBe("monthly");
    expect(brandForKey("metzgerei muster gmbh")).toBeNull();
  });
});
