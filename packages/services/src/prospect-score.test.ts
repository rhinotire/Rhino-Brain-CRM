import { describe, expect, it } from "vitest";
import { assignStateLocation, scoreProspect } from "./prospect-score";

describe("assignStateLocation", () => {
  it("routes southeast to RHINO and south-central to EVERFLOW", () => {
    expect(assignStateLocation("FL")).toBe("RHINO");
    expect(assignStateLocation("GA")).toBe("RHINO");
    expect(assignStateLocation("TX")).toBe("EVERFLOW");
    expect(assignStateLocation("OK")).toBe("EVERFLOW");
  });
  it("returns null for other/unknown states (owner assigns manually)", () => {
    expect(assignStateLocation("CA")).toBeNull();
    expect(assignStateLocation(null)).toBeNull();
  });
});

const enrichment = {
  emails: ["buyer@x.com"], brandsSold: ["Sailun"], sellsWholesale: true,
  businessSummary: "Commercial tire distributor.", buyerSignals: ["dealer portal"],
};

describe("scoreProspect", () => {
  it("passes through a valid verdict", async () => {
    const ask = (async () => ({
      json: {
        pool: "A_BUYER", confidence: "H", productLine: "P4_TBR", score: 86,
        checks: [{ check: "real entity", pass: true, evidence: "has website + locations" }],
      },
      inputTokens: 900, outputTokens: 200,
    })) as never;
    const r = await scoreProspect({ companyName: "X", state: "TX", enrichment }, ask);
    expect(r.verdict.pool).toBe("A_BUYER");
    expect(r.verdict.score).toBe(86);
  });
  it("degrades an invalid payload to C/L/0 instead of throwing", async () => {
    const ask = (async () => ({ json: { pool: "WHATEVER", score: "high" }, inputTokens: 1, outputTokens: 1 })) as never;
    const r = await scoreProspect({ companyName: "X", state: null, enrichment }, ask);
    expect(r.verdict).toMatchObject({ pool: "C_CHANNEL", confidence: "L", score: 0 });
  });

  it("degrades NaN score to the fallback verdict", async () => {
    const ask = (async () => ({
      json: { pool: "A_BUYER", confidence: "H", productLine: "P4_TBR", score: NaN, checks: [] },
      inputTokens: 1, outputTokens: 1,
    })) as never;
    const r = await scoreProspect({ companyName: "X", state: "TX", enrichment }, ask);
    expect(r.verdict).toMatchObject({ pool: "C_CHANNEL", confidence: "L", score: 0 });
  });

  it("clamps out-of-range scores and drops malformed checks", async () => {
    const ask = (async () => ({
      json: {
        pool: "A_BUYER", confidence: "H", productLine: "P4_TBR", score: 150,
        checks: [
          { check: "real entity", pass: true, evidence: "site" },
          { check: "no evidence", pass: true },
          { check: 5, pass: "yes", evidence: "junk" },
        ],
      },
      inputTokens: 1, outputTokens: 1,
    })) as never;
    const r = await scoreProspect({ companyName: "X", state: "TX", enrichment }, ask);
    expect(r.verdict.score).toBe(100);
    expect(r.verdict.checks).toHaveLength(1);
  });
});
