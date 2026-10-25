import { describe, expect, it } from "vitest";
import {
  COLUMN_DEFINITION_LINES, TIER_DIRECTION_LINE, convertedDisclosureLines, pct, tierLabel, tierTableHeader, tierTableRow, usd,
  type Counts,
} from "./dealer-batch-report";
import { compareForRelease, tierFor } from "./dealer-tier";
import type { DealerRecord } from "./dealer-list-parse";

/**
 * The printed text of `reconcile-dealers.ts --batch`. The report's tier direction once shipped
 * backwards because nothing tested the words, only the arithmetic under them. These pin the words
 * against the facts they state.
 */

const counts = (over: Partial<Counts> = {}): Counts => ({
  leads: 100, claimed: 0, parked: 0, contacted: 40, quoted: 10, converted: 5, convertedValue: 1234.5,
  convertedUnverified: 2, convertedValueUnverified: 99, convertedPerContacted: 0.125, ...over,
});

// A bare dealer, only for asking tierFor / compareForRelease who is released first.
const dealer = (over: Partial<DealerRecord>): DealerRecord => ({
  name: "D", street: "", city: "Orlando", state: "FL", zip: "", phone: "", email: "", website: "", brands: ["A"],
  locations: [], country: "US", dedupeKey: "", ...over,
});

describe("TIER_DIRECTION_LINE", () => {
  it("says a LOWER tier number is released earlier, never the reverse", () => {
    expect(TIER_DIRECTION_LINE).toContain("Lower number = released to reps earlier");
    expect(TIER_DIRECTION_LINE).not.toMatch(/higher number/i);
  });

  it("is true: the release order really does put the lower tier number first", () => {
    const tier2 = dealer({ brands: ["A", "B"] }); // home state, 2+ brands
    const tier4 = dealer({ brands: ["A"] }); // home state, 1 brand, no distance known
    expect(tierFor(tier2)).toBe(2);
    expect(tierFor(tier4)).toBe(4);
    expect(compareForRelease(tier2, tier4)).toBeLessThan(0);
  });

  it("names the tiers it names the way the tier labels do: T1 existing customers, T2 the best prospect tier, T8 parked", () => {
    expect(TIER_DIRECTION_LINE).toMatch(/T1 is existing customers/);
    expect(TIER_DIRECTION_LINE).toMatch(/T2 is the best prospect tier/);
    expect(TIER_DIRECTION_LINE).toMatch(/T8 is parked/);
    expect(tierLabel(1)).toMatch(/existing customer/i);
    expect(tierLabel(2)).toMatch(/home state, 2\+ brands/);
    expect(tierLabel(8)).toMatch(/parked/i);
  });
});

describe("convertedDisclosureLines", () => {
  it("warns that Converted counts leads while Converted $ is per customer", () => {
    const [counting] = convertedDisclosureLines(counts());
    expect(counting).toContain("Converted counts LEADS");
    expect(counting).toContain("deduped per CUSTOMER");
  });

  it("discloses how many converted leads and how many dollars were held back as not won", () => {
    const [, heldBack] = convertedDisclosureLines(counts({ convertedUnverified: 2, converted: 5, convertedValueUnverified: 1234.5 }));
    expect(heldBack).toContain("2 of 5 converted lead(s)");
    expect(heldBack).toContain("$1,234.50 not counted as won");
  });

  it("says which customers are held back: ones that predate the conversion AND ones created after it", () => {
    const [, heldBack] = convertedDisclosureLines(counts());
    expect(heldBack).toMatch(/predate/);
    expect(heldBack).toMatch(/after/);
    expect(heldBack).toMatch(/creation time unknown/);
  });

  it("still prints the disclosure when nothing is held back (a silent zero would hide the rule)", () => {
    const [, heldBack] = convertedDisclosureLines(counts({ convertedUnverified: 0, convertedValueUnverified: 0 }));
    expect(heldBack).toContain("0 of 5 converted lead(s)");
    expect(heldBack).toContain("$0.00 not counted as won");
  });
});

describe("tier table", () => {
  const cells = (row: string) => row.slice(54).trim().split(" ").filter(Boolean);

  it("shows the unverified-converted count per tier, in its own column", () => {
    expect(tierTableHeader()).toContain("Unverified");
    // leads, parked, contacted, quoted, converted, unverified, $, rate
    expect(cells(tierTableRow("T2  home state, 2+ brands", counts({ converted: 5, convertedUnverified: 2 })))).toEqual([
      "100", "0", "40", "10", "5", "2", "$1,234.50", "12.5%",
    ]);
  });

  it("keeps the header and every row on the same column grid", () => {
    expect(tierTableHeader().length).toBe(tierTableRow("ALL TIERS", counts()).length);
  });

  it("prints n/a, not 0%, when nobody was contacted", () => {
    expect(tierTableRow("T3", counts({ contacted: 0, convertedPerContacted: null }))).toMatch(/n\/a$/);
  });
});

describe("number formats", () => {
  it("formats dollars to the cent with thousands separators", () => {
    expect(usd(0)).toBe("$0.00");
    expect(usd(1234.5)).toBe("$1,234.50");
  });
  it("formats a rate to one decimal and null as n/a", () => {
    expect(pct(0.125)).toBe("12.5%");
    expect(pct(null)).toBe("n/a");
  });
});

describe("COLUMN_DEFINITION_LINES (M-6)", () => {
  const text = COLUMN_DEFINITION_LINES.join("\n");

  it("defines every column the table prints", () => {
    for (const col of ["Leads", "Parked", "Contacted", "Quoted", "Converted ", "Converted $"]) expect(text).toContain(col);
  });

  it("says the stages are NOT nested, so a Converted figure above Quoted is not read as a bug", () => {
    expect(text).toMatch(/not nested/i);
    expect(text).toMatch(/Converted can exceed Quoted/);
  });

  it("explains why: a converted lead is not counted as quoted unless there is evidence of a quote", () => {
    expect(text).toMatch(/no evidence of a quote/i);
  });
});
