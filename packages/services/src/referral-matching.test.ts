import { beforeEach, describe, expect, it, vi } from "vitest";

const installerFindMany = vi.fn();
const customerFindMany = vi.fn();

vi.mock("@rhino/database", () => ({
  db: {
    installer: { findMany: (...a: unknown[]) => installerFindMany(...a) },
    customer: { findMany: (...a: unknown[]) => customerFindMany(...a) },
  },
}));

import { matchInstallerReferral, phoneKey, domainKey, nameKey } from "./referral-matching";

const dealer = {
  id: "cust1", companyName: "Sunshine Tire & Auto", phone: "(407) 555-0100", contactCell: null,
  website: "https://www.sunshinetire.com", zip: "32810", assignedRepId: "rep9", locationId: "locFL",
};

beforeEach(() => {
  installerFindMany.mockReset().mockResolvedValue([]);
  customerFindMany.mockReset().mockResolvedValue([dealer]);
});

describe("normalization keys", () => {
  it("phoneKey ignores formatting and country code", () => {
    expect(phoneKey("(407) 555-0100")).toBe("4075550100");
    expect(phoneKey("+1 407 555 0100")).toBe("4075550100");
    expect(phoneKey("555-0100")).toBe("");
  });
  it("domainKey strips protocol and www", () => {
    expect(domainKey("https://www.SunshineTire.com/contact")).toBe("sunshinetire.com");
    expect(domainKey("sunshinetire.com")).toBe("sunshinetire.com");
    expect(domainKey("not a url")).toBe("");
  });
  it("nameKey drops generic industry words", () => {
    expect(nameKey("Sunshine Tire & Auto LLC")).toBe(nameKey("SUNSHINE TIRES"));
  });
});

describe("matchInstallerReferral", () => {
  it("matches an existing dealer by phone (any format) and preserves the rep", async () => {
    const m = await matchInstallerReferral({ rawName: "some shop", rawPhone: "407.555.0100" });
    expect(m.matchStatus).toBe("EXISTING_DEALER");
    expect(m.customerId).toBe("cust1");
    expect(m.assignedRepId).toBe("rep9"); // spec §18: existing rep preserved
  });

  it("matches by website domain", async () => {
    const m = await matchInstallerReferral({ rawName: "whatever", rawWebsite: "sunshinetire.com" });
    expect(m.matchStatus).toBe("EXISTING_DEALER");
  });

  it("matches by normalized name + same ZIP", async () => {
    const m = await matchInstallerReferral({ rawName: "SUNSHINE TIRES", rawZip: "32810" });
    expect(m.matchStatus).toBe("EXISTING_DEALER");
  });

  it("similar name without confirmation → POSSIBLE_DUPLICATE, never silent", async () => {
    const m = await matchInstallerReferral({ rawName: "Sunshine Tire", rawZip: "33101" });
    expect(m.matchStatus).toBe("POSSIBLE_DUPLICATE");
    expect(m.customerId).toBe("cust1");
  });

  it("unknown shop → NEW_PROSPECT", async () => {
    const m = await matchInstallerReferral({ rawName: "Totally Different Garage", rawPhone: "9995551234", rawZip: "75201" });
    expect(m.matchStatus).toBe("NEW_PROSPECT");
  });

  it("installer table with dealer link wins as EXISTING_DEALER", async () => {
    installerFindMany.mockResolvedValue([
      { id: "inst1", storeName: "Gator Wheel Depot", phone: "3215550001", website: null, zip: "32837", assignedRepId: "rep2", locationId: "locFL", customerId: "cust7" },
    ]);
    const m = await matchInstallerReferral({ rawName: "x", rawPhone: "(321) 555-0001" });
    expect(m.matchStatus).toBe("EXISTING_DEALER");
    expect(m.installerId).toBe("inst1");
    expect(m.customerId).toBe("cust7");
  });
});
