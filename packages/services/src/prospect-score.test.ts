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

  it("zeroes a NaN score but keeps the otherwise-valid fields", async () => {
    const ask = (async () => ({
      json: { pool: "A_BUYER", confidence: "H", productLine: "P4_TBR", score: NaN, checks: [] },
      inputTokens: 1, outputTokens: 1,
    })) as never;
    const r = await scoreProspect({ companyName: "X", state: "TX", enrichment }, ask);
    expect(r.verdict).toMatchObject({ pool: "A_BUYER", confidence: "H", score: 0 });
  });

  it("normalizes productLine shorthand like TBR/pcr (real-run 2026-07-25)", async () => {
    const ask = (async () => ({
      json: { pool: "D_EXCLUDED", confidence: "L", productLine: "TBR", score: 12, checks: [] },
      inputTokens: 1, outputTokens: 1,
    })) as never;
    const r = await scoreProspect({ companyName: "X", state: "TX", enrichment }, ask);
    expect(r.verdict).toMatchObject({ pool: "D_EXCLUDED", productLine: "P4_TBR", score: 12 });

    const ask2 = (async () => ({
      json: { pool: "A_BUYER", confidence: "M", productLine: "trailer tire", score: 60, checks: [] },
      inputTokens: 1, outputTokens: 1,
    })) as never;
    const r2 = await scoreProspect({ companyName: "Y", state: "FL", enrichment }, ask2);
    expect(r2.verdict.productLine).toBe("P1_TRAILER_TIRE");
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
