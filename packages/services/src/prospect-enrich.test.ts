import { describe, expect, it } from "vitest";
import { extractEnrichment, fetchSiteText } from "./prospect-enrich";

const fakeAsk = (async () => ({
  json: {
    emails: ["sales@lonestartt.com"],
    brandsSold: ["Sailun", "Westlake"],
    sellsWholesale: true,
    businessSummary: "Regional commercial tire distributor in Texas.",
    buyerSignals: ["dealer login page", "pallet pricing mentioned"],
  },
  inputTokens: 500,
  outputTokens: 120,
})) as never;

describe("extractEnrichment", () => {
  it("returns parsed enrichment + token counts", async () => {
    const r = await extractEnrichment("<html>…site text…</html>", "Lone Star Truck Tires", fakeAsk);
    expect(r.enrichment.sellsWholesale).toBe(true);
    expect(r.enrichment.brandsSold).toContain("Sailun");
    expect(r.outputTokens).toBe(120);
  });
  it("normalizes a malformed payload to safe defaults", async () => {
    const badAsk = (async () => ({ json: { emails: "not-an-array" }, inputTokens: 1, outputTokens: 1 })) as never;
    const r = await extractEnrichment("x", "Y", badAsk);
    expect(r.enrichment.emails).toEqual([]);
    expect(r.enrichment.sellsWholesale).toBeNull();
  });
});

describe("fetchSiteText", () => {
  it("strips tags and caps length", async () => {
    const fakeFetch = (async () => new Response("<html><script>x()</script><body><h1>Truck Tires</h1><p>Wholesale pallets</p></body></html>")) as typeof fetch;
    const text = await fetchSiteText("https://example.com", fakeFetch);
    expect(text).toContain("Truck Tires");
    expect(text).toContain("Wholesale pallets");
    expect(text).not.toContain("<h1>");
    expect(text).not.toContain("x()");
  });
  it("returns empty string on fetch failure", async () => {
    const failFetch = (async () => { throw new Error("boom"); }) as unknown as typeof fetch;
    expect(await fetchSiteText("https://example.com", failFetch)).toBe("");
  });
  it("caps extracted text at 8000 chars", async () => {
    const big = `<body>${"tire ".repeat(3000)}</body>`;
    const fakeFetch = (async () => new Response(big)) as typeof fetch;
    const text = await fetchSiteText("https://example.com", fakeFetch);
    expect(text.length).toBeLessThanOrEqual(8000);
    expect(text.length).toBeGreaterThan(7000);
  });
});
