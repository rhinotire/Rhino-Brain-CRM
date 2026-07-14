import { describe, expect, it } from "vitest";
import { normalizeSizeInput, sizeNeedles, sizeSuggestion } from "./size-normalize";

/** Spec §26 acceptance: reasonable formatting differences → identical matches. */
describe("normalizeSizeInput — equivalence classes", () => {
  const same = (inputs: string[], display: string) => {
    for (const i of inputs) {
      const n = normalizeSizeInput(i);
      expect(n, `input "${i}" should parse`).not.toBeNull();
      expect(n!.display, `input "${i}"`).toBe(display);
    }
  };

  it("passenger metric variants", () => {
    same(["225/65R17", "2256517", "225 65 17", "225-65-R17", "225/65 R17", "225 65 r17"], "225/65R17");
  });

  it("commercial metric with .5 rim", () => {
    same(["295/75R22.5", "29575225", "295 75 22.5", "295/75R225"], "295/75R22.5");
  });

  it("ST trailer variants keep the prefix when typed", () => {
    same(["ST235/80R16", "ST23580R16", "st235 80 r16"], "ST235/80R16");
  });

  it("truck rim-only sizes", () => {
    same(["11R22.5", "11R225", "11 R 22.5"], "11R22.5");
    same(["285/75R24.5", "285 75 245", "28575245"], "285/75R24.5");
  });

  it("flotation variants", () => {
    same(["33X12.50R20", "33 12.50 20", "33x12.5r20"], "33X12.5R20");
  });

  it("flotation with slash separators and digit-form width (owner-reported)", () => {
    same(["33/1250/20", "33x1250x20", "33 1250 20", "33/12.50/20"], "33X12.5R20");
    same(["30/950/15", "30 950 15"], "30X9.5R15");
  });

  it("flotation needles cover both X and slash catalog notations", () => {
    const needles = sizeNeedles("33125020");
    expect(needles).toContain("33X12.50R20"); // 33X12.50R20 stored form
    expect(needles).toContain("33/12.50R20"); // LT33/12.50R20-12PR stored form
  });

  it("tolerates ply suffixes dealers type from supplier specs", () => {
    same(["ST225/75R15-10PR", "ST225/75R15 10PR", "ST225/75R15-10P"], "ST225/75R15");
    same(["11R22.5 16PR", "11R22.5-16PR"], "11R22.5");
    same(["235/75R17.5-16P"], "235/75R17.5");
    same(["LT31X10.50R15-6"], "31X10.5R15");
  });

  it("ZR and euro-C suffixes normalize to plain metric", () => {
    same(["205/45ZR16", "205/45R16", "2054516"], "205/45R16");
    same(["225/70R15C", "225/70R15"], "225/70R15");
  });

  it("LT-tagged flotation sizes", () => {
    same(["LT31X10.50R15", "31X10.50R15", "31 10.50 15"], "31X10.5R15");
    same(["30X9.50R15LT", "30X9.50R15"], "30X9.5R15");
  });

  it("rejects junk", () => {
    expect(normalizeSizeInput("hello")).toBeNull();
    expect(normalizeSizeInput("99/99R99")).toBeNull();
    expect(normalizeSizeInput("12345")).toBeNull();
  });
});

describe("sizeNeedles — DB matching substrings", () => {
  it("metric drops the prefix so digits find ST/LT products", () => {
    expect(sizeNeedles("2358016")).toEqual(["235/80R16"]); // matches "ST235/80R16" via contains
    expect(sizeNeedles("ST235/80R16")).toEqual(["235/80R16"]);
  });
  it("truck sizes include the no-dot storage variant", () => {
    expect(sizeNeedles("11R22.5")).toContain("11R22.5");
    expect(sizeNeedles("11R225")).toContain("11R225");
  });
  it("flotation covers .50/.5 storage variants", () => {
    const n = sizeNeedles("33 12.50 20");
    expect(n).toContain("33X12.50R20");
    expect(n).toContain("33X12.5R20");
  });
});

describe("sizeSuggestion", () => {
  it("hints on partial sizes", () => {
    expect(sizeSuggestion("22565")).toMatch(/rim|width/i);
    expect(sizeSuggestion("225/65R17")).toBeNull();
  });
});
