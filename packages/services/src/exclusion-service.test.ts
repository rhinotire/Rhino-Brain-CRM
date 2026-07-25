import { describe, expect, it } from "vitest";
import { matchesExclusion, type ExclusionRow } from "./exclusion-service";

const rows: ExclusionRow[] = [
  { kind: "COMPETITOR", companyName: "Tredit Tire & Wheel", domain: "tredit.com", phone: null },
  { kind: "EXISTING_CUSTOMER", companyName: "Sunshine Tires LLC", domain: null, phone: "4075551234" },
  { kind: "AGENT", companyName: "Gulf Coast Wholesale Tire", domain: null, phone: null },
];

describe("matchesExclusion", () => {
  it("matches by normalized domain", () => {
    const hit = matchesExclusion({ website: "https://www.tredit.com/products" }, rows);
    expect(hit?.kind).toBe("COMPETITOR");
  });
  it("matches by normalized phone", () => {
    const hit = matchesExclusion({ phone: "+1 407-555-1234" }, rows);
    expect(hit?.kind).toBe("EXISTING_CUSTOMER");
  });
  it("matches by name key when no domain/phone on row", () => {
    const hit = matchesExclusion({ companyName: "Gulf Coast Wholesale Tire Inc" }, rows);
    expect(hit?.kind).toBe("AGENT");
  });
  it("does not match unrelated company", () => {
    expect(matchesExclusion({ companyName: "Lone Star Truck Tires", website: "lonestartt.com" }, rows)).toBeNull();
  });
});
