import { describe, expect, it, vi } from "vitest";
import { enrichCandidates, selectCandidates, type CandidateRow, type EnrichDeps } from "./dealer-enrich";

const row = (id: string, meta: unknown, over: Partial<CandidateRow> = {}): CandidateRow => ({
  id, companyName: `Co ${id}`, city: "Orlando", state: "FL", meta, ...over,
});
const dl = (tier: unknown, extra: object = {}) => ({ importSource: "dealer-locators", tier, ...extra });

describe("selectCandidates", () => {
  it("keeps tiers at or above the cut, best first, id as tiebreak", () => {
    const rows = [row("d", dl(3)), row("b", dl(2)), row("a", dl(2)), row("c", dl(1))];
    expect(selectCandidates(rows, { maxTier: 2, limit: null }).map((c) => c.id)).toEqual(["c", "a", "b"]);
  });

  it("drops other import sources and missing or non-integer tiers instead of guessing", () => {
    const rows = [
      row("a", { importSource: "something-else", tier: 2 }),
      row("b", dl("2")),
      row("c", dl(2.5)),
      row("d", { importSource: "dealer-locators" }),
      row("e", null),
      row("f", dl(2)),
    ];
    expect(selectCandidates(rows, { maxTier: 8, limit: null }).map((c) => c.id)).toEqual(["f"]);
  });

  it("applies the limit after the tier cut", () => {
    const rows = [row("a", dl(5)), row("b", dl(2)), row("c", dl(2)), row("d", dl(2))];
    expect(selectCandidates(rows, { maxTier: 2, limit: 2 }).map((c) => c.id)).toEqual(["b", "c"]);
  });

  it("carries a usable meta.website and ignores junk", () => {
    const rows = [
      row("a", dl(2, { website: " https://a.example.com " })),
      row("b", dl(2, { website: "not a url" })),
      row("c", dl(2, { website: "" })),
      row("d", dl(2, { website: 42 })),
    ];
    const got = selectCandidates(rows, { maxTier: 2, limit: null });
    expect(got.map((c) => c.cachedWebsite)).toEqual(["https://a.example.com", null, null, null]);
  });
});

const cand = (id: string, cachedWebsite: string | null = null) => ({
  id, companyName: `Co ${id}`, city: "Orlando", state: "FL", tier: 2, cachedWebsite,
});

const goodDeps = (over: Partial<EnrichDeps> = {}): EnrichDeps => ({
  resolveWebsite: vi.fn(async () => ({ website: "https://found.example.com", confidence: "HIGH" as const })),
  fetchSiteText: vi.fn(async () => "some site text"),
  extractEnrichment: vi.fn(async () => ({ enrichment: { emails: [] }, inputTokens: 100, outputTokens: 10 })),
  scoreProspect: vi.fn(async () => ({
    verdict: { pool: "A_BUYER", confidence: "H", productLine: "P4_TBR", score: 80, checks: [] },
    inputTokens: 50, outputTokens: 5,
  })),
  persist: vi.fn(async () => undefined),
  ...over,
});

describe("enrichCandidates", () => {
  it("dry run never touches a dependency (zero Places, fetch, model or write)", async () => {
    const boom = () => { throw new Error("dry run must not call this"); };
    const deps: EnrichDeps = {
      resolveWebsite: vi.fn(boom), fetchSiteText: vi.fn(boom), extractEnrichment: vi.fn(boom),
      scoreProspect: vi.fn(boom), persist: vi.fn(boom),
    };
    const stats = await enrichCandidates([cand("a"), cand("b", "https://b.example.com")], { dry: true, deps });
    expect(stats.selected).toBe(2);
    expect(stats.attempted).toBe(0);
    for (const fn of Object.values(deps)) expect(fn).not.toHaveBeenCalled();
  });

  it("uses the cached website and skips the Places call; resolves only when absent", async () => {
    const deps = goodDeps();
    const stats = await enrichCandidates([cand("a", "https://a.example.com"), cand("b")], { dry: false, deps });
    expect(deps.resolveWebsite).toHaveBeenCalledTimes(1);
    expect(deps.fetchSiteText).toHaveBeenNthCalledWith(1, "https://a.example.com");
    expect(deps.fetchSiteText).toHaveBeenNthCalledWith(2, "https://found.example.com");
    expect(stats).toMatchObject({ cachedWebsite: 1, resolvedWebsite: 1, placesCalls: 1, enriched: 2 });
    expect(stats.inputTokens).toBe(300);
    expect(stats.outputTokens).toBe(30);
    expect(stats.pools).toEqual({ A_BUYER: 2 });
  });

  it("one bad lead does not abort the run and is never persisted", async () => {
    const persist = vi.fn(async () => undefined);
    const extractEnrichment = vi
      .fn()
      .mockResolvedValueOnce({ enrichment: {}, inputTokens: 1, outputTokens: 1 })
      .mockRejectedValueOnce(new Error("Claude reply was not JSON"))
      .mockResolvedValueOnce({ enrichment: {}, inputTokens: 1, outputTokens: 1 });
    const deps = goodDeps({ persist, extractEnrichment });
    const stats = await enrichCandidates([cand("a", "x.com"), cand("b", "y.com"), cand("c", "z.com")], { dry: false, deps });
    expect(stats).toMatchObject({ attempted: 3, enriched: 2, failed: 1 });
    expect(stats.failures[0]).toMatchObject({ id: "b", reason: "Claude reply was not JSON" });
    expect(persist.mock.calls.map((c) => (c as unknown[])[0])).toEqual(["a", "c"]);
  });

  it("an unloadable page spends no model tokens and writes nothing, so the lead stays eligible", async () => {
    const deps = goodDeps({ fetchSiteText: vi.fn(async () => "") });
    const stats = await enrichCandidates([cand("a", "dead.example.com")], { dry: false, deps });
    expect(stats.unreachable).toBe(1);
    expect(deps.extractEnrichment).not.toHaveBeenCalled();
    expect(deps.persist).not.toHaveBeenCalled();
  });

  it("a LOW-confidence website is not fetched", async () => {
    const deps = goodDeps({ resolveWebsite: vi.fn(async () => ({ website: "https://maybe.example.com", confidence: "LOW" as const })) });
    const stats = await enrichCandidates([cand("a")], { dry: false, deps });
    expect(stats.noSite).toBe(1);
    expect(stats.placesCalls).toBe(1);
    expect(deps.fetchSiteText).not.toHaveBeenCalled();
  });

  it("counts a Places call that throws, and keeps going", async () => {
    const resolveWebsite = vi.fn().mockRejectedValueOnce(new Error("Places 429")).mockResolvedValueOnce({ website: "https://ok.example.com", confidence: "HIGH" });
    const stats = await enrichCandidates([cand("a"), cand("b")], { dry: false, deps: goodDeps({ resolveWebsite }) });
    expect(stats).toMatchObject({ failed: 1, enriched: 1, placesCalls: 2 });
  });
});
