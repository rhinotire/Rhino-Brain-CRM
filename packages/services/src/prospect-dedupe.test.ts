import { describe, expect, it } from "vitest";
import { dedupeKeyFor } from "./prospect-dedupe";

describe("dedupeKeyFor", () => {
  it("prefers domain over phone and name", () => {
    expect(
      dedupeKeyFor({ website: "https://www.mccarthytire.com/about", phone: "(570) 555-1234", companyName: "McCarthy Tire" })
    ).toBe("d:mccarthytire.com");
  });
  it("falls back to phone last-10", () => {
    expect(dedupeKeyFor({ phone: "+1 (407) 555-9876", companyName: "X" })).toBe("p:4075559876");
  });
  it("falls back to nameKey + lowercased city", () => {
    expect(dedupeKeyFor({ companyName: "Bob's Tire Shop LLC", city: "Orlando" })).toBe("n:bobs:orlando");
  });
  it("returns empty string when nothing usable", () => {
    expect(dedupeKeyFor({ companyName: "The Tire Co" })).toBe(""); // nameKey too short, no city
    expect(dedupeKeyFor({})).toBe("");
  });
});
