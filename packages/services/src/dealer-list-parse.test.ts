import { describe, it, expect } from "vitest";
import { mergeDealerRows } from "./dealer-list-parse";

describe("mergeDealerRows", () => {
  it("merges the same dealer across sheets by phone into one record with both brands", () => {
    const out = mergeDealerRows([
      { brand: "KG1 FORGED", name: "WHEEL SPECIALISTS, INC.", city: "Tempe", state: "AZ", phone: "480-968-1314", street: "", zip: "", country: "USA", email: "", website: "" },
      { brand: "FUEL OFF-ROAD", name: "Wheel Specialists Inc", city: "TEMPE", state: "AZ", phone: "(480) 968-1314", street: "", zip: "", country: "USAA", email: "a@b.com", website: "" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].brands).toEqual(["FUEL OFF-ROAD", "KG1 FORGED"]);
    expect(out[0].email).toBe("a@b.com"); // first non-empty wins
  });

  it("derives country from STATE and ignores a corrupt Country column", () => {
    const out = mergeDealerRows([
      { brand: "KG1 FORGED", name: "A Shop", city: "Dallas", state: "TX", phone: "2145551212", street: "", zip: "", country: "USAA", email: "", website: "" },
      { brand: "KG1 FORGED", name: "B Shop", city: "Calgary", state: "AB", phone: "4035551212", street: "", zip: "", country: "76013", email: "", website: "" },
      { brand: "KG1 FORGED", name: "C Shop", city: "Paris", state: "", phone: "5551230000", street: "", zip: "", country: "USA", email: "", website: "" },
    ]);
    expect(out.find(r => r.name === "A Shop")!.country).toBe("US");
    expect(out.find(r => r.name === "B Shop")!.country).toBe("CA");
    expect(out.find(r => r.name === "C Shop")!.country).toBe("OTHER");
  });

  it("marks a row with no phone and a short name as non-dedupable", () => {
    const out = mergeDealerRows([
      { brand: "KG1 FORGED", name: "ABC", city: "", state: "TX", phone: "", street: "", zip: "", country: "", email: "", website: "" },
    ]);
    expect(out[0].dedupeKey).toBe("");
  });

  it("never merges two non-dedupable rows (empty key stands alone)", () => {
    const base = { name: "ABC", city: "", state: "TX", phone: "", street: "", zip: "", country: "", email: "", website: "" };
    const out = mergeDealerRows([
      { ...base, brand: "KG1 FORGED" },
      { ...base, brand: "JTX FORGED" },
    ]);
    expect(out).toHaveLength(2);
    expect(out.every(r => r.dedupeKey === "")).toBe(true);
  });

  it("dedupes repeated brands and first non-empty wins per field", () => {
    const out = mergeDealerRows([
      { brand: "KG1 FORGED", name: "Rim Shop", city: "Austin", state: "TX", phone: "5125550000", street: "", zip: "78701", country: "", email: "", website: "" },
      { brand: "KG1 FORGED", name: "Rim Shop", city: "Austin", state: "TX", phone: "5125550000", street: "1 Main", zip: "99999", country: "", email: "", website: "" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].brands).toEqual(["KG1 FORGED"]);
    expect(out[0].street).toBe("1 Main");
    expect(out[0].zip).toBe("78701");
  });

  it("keeps every distinct address when one phone covers several locations", () => {
    const out = mergeDealerRows([
      { brand: "KG1 FORGED", name: "Chain Tire", city: "Bend", state: "OR", zip: "97701", street: "1 A St", phone: "509-248-1052", country: "USA", email: "", website: "" },
      { brand: "FUEL OFF-ROAD", name: "Chain Tire", city: "Yakima", state: "WA", zip: "98901", street: "2 B St", phone: "(509) 248-1052", country: "USAA", email: "", website: "" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].locations).toHaveLength(2);
    expect(out[0].locations.map(l => l.city).sort()).toEqual(["Bend", "Yakima"]);
    // top-level address keeps first-row behaviour
    expect(out[0].city).toBe("Bend");
  });

  it("gives a single-row record exactly one location, and dedupes identical addresses", () => {
    const single = mergeDealerRows([
      { brand: "KG1 FORGED", name: "ABC", city: "", state: "TX", phone: "", street: "", zip: "", country: "", email: "", website: "" },
    ]);
    expect(single[0].locations).toEqual([{ street: "", city: "", state: "TX", zip: "" }]);

    const same = { name: "Rim Shop", city: "Austin", state: "TX", phone: "5125550000", street: "1 Main", zip: "78701", country: "", email: "", website: "" };
    const merged = mergeDealerRows([{ ...same, brand: "KG1 FORGED" }, { ...same, brand: "JTX FORGED" }]);
    expect(merged[0].locations).toHaveLength(1);
  });

  it("treats cosmetic address variants as one location but keeps real branches apart", () => {
    const out = mergeDealerRows([
      { brand: "KG1 FORGED", name: "Rim Co", city: "Tempe", state: "AZ", zip: "85281", street: "100 N. Main Street", phone: "480-555-0100", country: "USA", email: "", website: "" },
      { brand: "FUEL OFF-ROAD", name: "Rim Co", city: "TEMPE", state: "az", zip: "85281-1234", street: "100 N Main St", phone: "(480) 555-0100", country: "USAA", email: "", website: "" },
      { brand: "JTX FORGED", name: "Rim Co", city: "Tempe", state: "AZ", zip: "85281", street: "100 S Main St", phone: "480-555-0100", country: "", email: "", website: "" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].locations).toHaveLength(2); // N and S are different shops
    expect(out[0].locations[0].street).toBe("100 N. Main Street"); // original kept, not normalised
  });

  it("maps street suffixes as whole words only", () => {
    const out = mergeDealerRows([
      { brand: "KG1 FORGED", name: "Rim Co", city: "Tempe", state: "AZ", zip: "", street: "5 Streeter Avenue, Suite #2", phone: "480-555-0101", country: "", email: "", website: "" },
      { brand: "JTX FORGED", name: "Rim Co", city: "Tempe", state: "AZ", zip: "", street: "5 STREETER AVE STE 2", phone: "480-555-0101", country: "", email: "", website: "" },
      { brand: "JTX FORGED", name: "Rim Co", city: "Tempe", state: "AZ", zip: "", street: "5 STER AVE STE 2", phone: "480-555-0101", country: "", email: "", website: "" },
    ]);
    expect(out[0].locations).toHaveLength(2);
  });
  it("collapses runs of whitespace in a street before comparing", () => {
    const out = mergeDealerRows([
      { brand: "KG1 FORGED", name: "Gap Co", city: "Tempe", state: "AZ", zip: "85281", street: "100  N   Main  St", phone: "480-555-0199", country: "USA", email: "", website: "" },
      { brand: "FUEL OFF-ROAD", name: "Gap Co", city: "Tempe", state: "AZ", zip: "85281", street: "100 N Main St", phone: "(480) 555-0199", country: "", email: "", website: "" },
    ]);
    expect(out[0].locations).toHaveLength(1);
  });

  it("reduces a padded or suffixed zip to its first five digits", () => {
    const out = mergeDealerRows([
      { brand: "KG1 FORGED", name: "Zip Co", city: "Tempe", state: "AZ", zip: "  85281  ", street: "200 E Oak St", phone: "480-555-0200", country: "USA", email: "", website: "" },
      { brand: "FUEL OFF-ROAD", name: "Zip Co", city: "Tempe", state: "AZ", zip: "85281-1234", street: "200 E Oak St", phone: "(480) 555-0200", country: "", email: "", website: "" },
    ]);
    expect(out[0].locations).toHaveLength(1);
  });
  it("ignores non-digit characters in a zip/postal code when comparing", () => {
    const out = mergeDealerRows([
      { brand: "KG1 FORGED", name: "Postal Co", city: "Calgary", state: "AB", zip: "T4J 1R2", street: "9 Elm Rd", phone: "403-555-0300", country: "", email: "", website: "" },
      { brand: "FUEL OFF-ROAD", name: "Postal Co", city: "Calgary", state: "AB", zip: "T4J1R2", street: "9 Elm Rd", phone: "(403) 555-0300", country: "", email: "", website: "" },
    ]);
    expect(out[0].locations).toHaveLength(1);
    expect(out[0].locations[0].zip).toBe("T4J 1R2"); // original kept
  });
});
