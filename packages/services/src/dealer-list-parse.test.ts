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
});
