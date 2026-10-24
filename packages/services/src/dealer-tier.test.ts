import { describe, it, expect } from "vitest";
import { tierFor, compareForRelease } from "./dealer-tier";
import { countryFromState } from "./dealer-list-parse";
import type { DealerRecord } from "./dealer-list-parse";

// Test fixture only. Country is derived from state exactly as the parser does,
// so a fixture can never disagree with what the parser would have produced.
function rec(over: Partial<DealerRecord> = {}): DealerRecord {
  const state = over.state ?? "FL";
  return {
    name: "Test Dealer",
    street: "",
    city: "",
    state,
    zip: "",
    phone: "",
    email: "",
    website: "",
    brands: ["A"],
    locations: [{ street: "", city: "", state, zip: "" }],
    country: countryFromState(state),
    dedupeKey: "",
    ...over,
  };
}

describe("tierFor", () => {
  it("ranks an existing customer tier 1", () => {
    expect(tierFor(rec({ state: "FL", brands: ["A"] }), { isExistingCustomer: true })).toBe(1);
  });
  it("ranks a home-state multi-brand dealer tier 2", () => {
    expect(tierFor(rec({ state: "FL", brands: ["A", "B"] }))).toBe(2);
  });
  it("ranks a home-state single-brand dealer near a hub tier 3, far tier 4", () => {
    expect(tierFor(rec({ state: "TX", brands: ["A"] }), { milesFromHub: 90 })).toBe(3);
    expect(tierFor(rec({ state: "TX", brands: ["A"] }), { milesFromHub: 400 })).toBe(4);
  });
  it("ranks a non-home 3-brand dealer tier 5, above a non-home single-brand", () => {
    expect(tierFor(rec({ state: "CA", brands: ["A", "B", "C"] }))).toBe(5);
    expect(tierFor(rec({ state: "CA", brands: ["A"] }))).toBe(7);
  });
  it("parks Canada at tier 8", () => {
    expect(tierFor(rec({ state: "ON", brands: ["A", "B"] }))).toBe(8);
  });

  // Judgement-call boundaries
  it("treats exactly 150 miles as near, and unknown distance as far", () => {
    expect(tierFor(rec({ state: "FL" }), { milesFromHub: 150 })).toBe(3);
    expect(tierFor(rec({ state: "FL" }), { milesFromHub: 151 })).toBe(4);
    expect(tierFor(rec({ state: "FL" }), { milesFromHub: null })).toBe(4);
    expect(tierFor(rec({ state: "FL" }))).toBe(4);
  });
  it("puts a non-home 2-brand dealer in tier 7 (3+ brands is the tier 5 bar)", () => {
    expect(tierFor(rec({ state: "CA", brands: ["A", "B"] }))).toBe(7);
  });
  it("parks Canada and international at 8 regardless of brand count", () => {
    expect(tierFor(rec({ state: "BC", brands: ["A", "B", "C", "D"] }))).toBe(8);
    expect(tierFor(rec({ state: "", brands: ["A", "B", "C"] }))).toBe(8);
  });
  it("ranks an existing customer tier 1 even in Canada", () => {
    expect(tierFor(rec({ state: "ON" }), { isExistingCustomer: true })).toBe(1);
  });
  it("accepts a lowercase home-state code", () => {
    expect(tierFor(rec({ state: "tx", brands: ["A", "B"] }))).toBe(2);
  });
  it("reads territory from state, not from the country field", () => {
    // a stale/incorrect country must not override a real home state
    expect(tierFor(rec({ state: "FL", brands: ["A", "B"], country: "OTHER" }))).toBe(2);
  });
  it("does not let a stale US country rescue a Canadian state", () => {
    expect(tierFor(rec({ state: "ON", brands: ["A", "B"], country: "US" }))).toBe(8);
  });
  it("trims a padded home-state code", () => {
    expect(tierFor(rec({ state: " TX ", brands: ["A", "B"] }))).toBe(2);
  });
});

describe("compareForRelease", () => {
  it("sorts an emailed dealer above an otherwise-identical one without", () => {
    const withEmail = rec({ state: "FL", brands: ["A", "B"], email: "x@y.com" });
    const without = rec({ state: "FL", brands: ["A", "B"], email: "" });
    expect(compareForRelease(withEmail, without)).toBeLessThan(0);
    expect(compareForRelease(without, withEmail)).toBeGreaterThan(0);
  });
  it("follows the spec tier table: a home single-brand dealer still sorts before a non-home 4-brand one", () => {
    // Spec §5 lists ranks 3-4 (home, single brand) above rank 5 (non-home, 3+ brands),
    // even though its prose says brand count outranks geography. The table wins here;
    // flagged to the controller in the task report.
    const far = rec({ state: "CA", brands: ["A", "B", "C", "D"] });
    const near = rec({ state: "FL", brands: ["A"] });
    expect(compareForRelease(near, far)).toBeLessThan(0);
  });
  it("lets a 4-brand dealer far away beat a 1-brand dealer far away", () => {
    const four = rec({ state: "CA", brands: ["A", "B", "C", "D"] });
    const one = rec({ state: "WA", brands: ["A"] });
    expect(compareForRelease(four, one)).toBeLessThan(0);
  });
  it("sorts by brand count within a tier, more brands first", () => {
    const four = rec({ state: "CA", brands: ["A", "B", "C", "D"], name: "Zed" });
    const three = rec({ state: "CA", brands: ["A", "B", "C"], name: "Abe" });
    expect(compareForRelease(four, three)).toBeLessThan(0);
  });
  it("ranks brand count above email within a tier", () => {
    const threeNoEmail = rec({ state: "FL", brands: ["A", "B", "C"], email: "" });
    const twoWithEmail = rec({ state: "FL", brands: ["A", "B"], email: "x@y.com" });
    expect(compareForRelease(threeNoEmail, twoWithEmail)).toBeLessThan(0);
  });
  it("treats a whitespace-only email as no email", () => {
    const real = rec({ email: "x@y.com" });
    const blank = rec({ email: "   " });
    expect(compareForRelease(real, blank)).toBeLessThan(0);
  });
  it("falls back to name, case-insensitively, and is deterministic", () => {
    const a = rec({ name: "alpha Wheels" });
    const b = rec({ name: "Beta Wheels" });
    expect(compareForRelease(a, b)).toBeLessThan(0);
    expect(compareForRelease(b, a)).toBeGreaterThan(0);
    expect(compareForRelease(a, rec({ name: "alpha Wheels" }))).toBe(0);
  });
  it("orders a mixed list tier-first", () => {
    const ca = rec({ name: "C", state: "ON", brands: ["A", "B"] });
    const home = rec({ name: "B", state: "FL", brands: ["A", "B"] });
    const far3 = rec({ name: "A", state: "CA", brands: ["A", "B", "C"] });
    const sorted = [ca, far3, home].sort(compareForRelease).map(d => d.name);
    expect(sorted).toEqual(["B", "A", "C"]);
  });
});
