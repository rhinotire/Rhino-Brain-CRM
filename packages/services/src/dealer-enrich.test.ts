import { describe, expect, it, vi } from "vitest";
import {
  MAX_CONSECUTIVE_FAILURES, applyAttempt, enrichCandidates, hasAttemptMarker, selectCandidates,
  type AttemptMarker, type CandidateRow, type EnrichDeps,
} from "./dealer-enrich";

const row = (id: string, meta: unknown, over: Partial<CandidateRow> = {}): CandidateRow => ({
  id, companyName: `Co ${id}`, city: "Orlando", state: "FL", locationId: "loc-fl", meta, ...over,
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

  it("never selects a parked lead (locationId null), whatever its tier", () => {
    const rows = [row("a", dl(1), { locationId: null }), row("b", dl(1)), row("c", dl(2), { locationId: null })];
    expect(selectCandidates(rows, { maxTier: 8, limit: null }).map((c) => c.id)).toEqual(["b"]);
    // not even when the attempt marker is bypassed: parked leads are unreachable by any rep
    expect(selectCandidates(rows, { maxTier: 8, limit: null, retrySkipped: true }).map((c) => c.id)).toEqual(["b"]);
  });

  it("skips a lead that carries an attempt marker, and only --retry-skipped brings it back", () => {
    const marked = row("a", dl(1, { enrichAttempt: { at: "2026-10-25T00:00:00.000Z", outcome: "no-site" } }));
    const rows = [marked, row("b", dl(2))];
    expect(selectCandidates(rows, { maxTier: 2, limit: null }).map((c) => c.id)).toEqual(["b"]);
    expect(selectCandidates(rows, { maxTier: 2, limit: null, retrySkipped: false }).map((c) => c.id)).toEqual(["b"]);
    expect(selectCandidates(rows, { maxTier: 2, limit: null, retrySkipped: true }).map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("a marked block does not eat the limit: --limit counts only unmarked leads", () => {
    const m = { enrichAttempt: { at: "t", outcome: "failed" } };
    const rows = [row("a", dl(1, m)), row("b", dl(1, m)), row("c", dl(2)), row("d", dl(2))];
    expect(selectCandidates(rows, { maxTier: 2, limit: 2 }).map((c) => c.id)).toEqual(["c", "d"]);
  });

  it("treats any non-null enrichAttempt as a marker (fails safe), but not null/absent", () => {
    expect(hasAttemptMarker(dl(1, { enrichAttempt: "weird" }))).toBe(true);
    expect(hasAttemptMarker(dl(1, { enrichAttempt: {} }))).toBe(true);
    expect(hasAttemptMarker(dl(1, { enrichAttempt: null }))).toBe(false);
    expect(hasAttemptMarker(dl(1))).toBe(false);
    expect(hasAttemptMarker(null)).toBe(false);
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
  markAttempt: vi.fn(async () => undefined),
  ...over,
});

/** The marker handed to markAttempt for the n-th (0-based) call. */
const markerAt = (deps: EnrichDeps, n = 0): AttemptMarker => (deps.markAttempt as ReturnType<typeof vi.fn>).mock.calls[n][1];

describe("enrichCandidates", () => {
  it("dry run never touches a dependency (zero Places, fetch, model or write)", async () => {
    const boom = () => { throw new Error("dry run must not call this"); };
    const deps: EnrichDeps = {
      resolveWebsite: vi.fn(boom), fetchSiteText: vi.fn(boom), extractEnrichment: vi.fn(boom),
      scoreProspect: vi.fn(boom), persist: vi.fn(boom), markAttempt: vi.fn(boom),
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

  it("an unloadable page spends no model tokens and persists no enrichment (only a marker)", async () => {
    const deps = goodDeps({ fetchSiteText: vi.fn(async () => "") });
    const stats = await enrichCandidates([cand("a", "dead.example.com")], { dry: false, deps });
    expect(stats.unreachable).toBe(1);
    expect(deps.extractEnrichment).not.toHaveBeenCalled();
    expect(deps.persist).not.toHaveBeenCalled();
    expect(deps.markAttempt).toHaveBeenCalledTimes(1);
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

describe("enrichCandidates: remembering paid work (attempt markers)", () => {
  it("a no-site lead gets a no-site marker (and no website)", async () => {
    const deps = goodDeps({ resolveWebsite: vi.fn(async () => ({ website: null, confidence: "LOW" as const })) });
    await enrichCandidates([cand("a")], { dry: false, deps });
    expect(deps.markAttempt).toHaveBeenCalledTimes(1);
    expect((deps.markAttempt as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe("a");
    const m = markerAt(deps);
    expect(m).toMatchObject({ outcome: "no-site" });
    expect(m).not.toHaveProperty("website");
    expect(Number.isNaN(Date.parse(m.at))).toBe(false);
  });

  it("a LOW-confidence website is never cached: the marker carries no website, so a re-run cannot skip the HIGH gate", async () => {
    const deps = goodDeps({ resolveWebsite: vi.fn(async () => ({ website: "https://maybe.example.com", confidence: "LOW" as const })) });
    await enrichCandidates([cand("a")], { dry: false, deps });
    expect(markerAt(deps)).toMatchObject({ outcome: "no-site" });
    expect(markerAt(deps)).not.toHaveProperty("website");
    expect(applyAttempt(dl(2), markerAt(deps))).not.toHaveProperty("website");
  });

  it("an unreachable lead gets a marker carrying the resolved website, which applyAttempt caches in meta.website", async () => {
    const deps = goodDeps({ fetchSiteText: vi.fn(async () => "") });
    await enrichCandidates([cand("a")], { dry: false, deps });
    expect(markerAt(deps)).toMatchObject({ outcome: "unreachable", website: "https://found.example.com" });
    expect(applyAttempt(dl(2), markerAt(deps)).website).toBe("https://found.example.com");
  });

  it("an unreachable lead with a cached website keeps that website in the marker", async () => {
    const deps = goodDeps({ fetchSiteText: vi.fn(async () => "") });
    await enrichCandidates([cand("a", "dead.example.com")], { dry: false, deps });
    expect(markerAt(deps)).toMatchObject({ outcome: "unreachable", website: "dead.example.com" });
  });

  it("a failed lead gets a failed marker with the reason", async () => {
    const deps = goodDeps({ resolveWebsite: vi.fn().mockRejectedValue(new Error("Places 429")) });
    await enrichCandidates([cand("a")], { dry: false, deps });
    expect(markerAt(deps)).toMatchObject({ outcome: "failed", reason: "Places 429" });
    expect(markerAt(deps)).not.toHaveProperty("website");
  });

  it("a lead that fails AFTER its website resolved still caches that website, so the Places call is not paid again", async () => {
    const deps = goodDeps({ extractEnrichment: vi.fn().mockRejectedValue(new Error("Claude reply was not JSON")) });
    await enrichCandidates([cand("a")], { dry: false, deps });
    expect(markerAt(deps)).toMatchObject({ outcome: "failed", website: "https://found.example.com" });
    expect(applyAttempt(dl(2), markerAt(deps)).website).toBe("https://found.example.com");
  });

  it("truncates a long failure reason in the marker", async () => {
    const deps = goodDeps({ resolveWebsite: vi.fn().mockRejectedValue(new Error("x".repeat(5000))) });
    await enrichCandidates([cand("a")], { dry: false, deps });
    expect((markerAt(deps).reason ?? "").length).toBe(200);
  });

  it("an enriched lead's marker rides along with persist (one write) and records the website used", async () => {
    const deps = goodDeps();
    await enrichCandidates([cand("a")], { dry: false, deps });
    const [leadId, result] = (deps.persist as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(leadId).toBe("a");
    expect(result.marker).toMatchObject({ outcome: "enriched", website: "https://found.example.com" });
    expect(deps.markAttempt).not.toHaveBeenCalled();
  });

  it("a failed marker write does not crash the run or hide the original failure", async () => {
    const deps = goodDeps({
      extractEnrichment: vi.fn().mockRejectedValue(new Error("model down")),
      markAttempt: vi.fn().mockRejectedValue(new Error("db down")),
    });
    const logs: string[] = [];
    const stats = await enrichCandidates([cand("a", "x.com"), cand("b", "y.com")], { dry: false, deps, log: (l) => logs.push(l) });
    expect(stats).toMatchObject({ attempted: 2, failed: 2 });
    expect(stats.failures.map((f) => f.reason)).toEqual(["model down", "model down"]);
    expect(logs.some((l) => l.includes("could not record") && l.includes("db down"))).toBe(true);
  });

  it("a marker-write failure on a no-site lead counts as a failure, not a no-site", async () => {
    const deps = goodDeps({
      resolveWebsite: vi.fn(async () => ({ website: null, confidence: "LOW" as const })),
      markAttempt: vi.fn().mockRejectedValue(new Error("db down")),
    });
    const stats = await enrichCandidates([cand("a")], { dry: false, deps });
    expect(stats).toMatchObject({ failed: 1, noSite: 0 });
  });
});

describe("applyAttempt", () => {
  const marker: AttemptMarker = { at: "2026-10-25T00:00:00.000Z", outcome: "no-site" };
  const full = {
    importSource: "dealer-locators", importFile: "dealers.xlsx", brands: ["Michelin", "Hankook"], brandCount: 2, tier: 1,
    locations: 3, milesFromHub: 41, stateRepairedFromZip: true,
  };

  it("merges the marker without dropping tier or any other existing key", () => {
    const out = applyAttempt(full, marker);
    expect(out).toEqual({ ...full, enrichAttempt: marker });
    expect(out.tier).toBe(1);
  });

  it("does not mutate the meta it was given", () => {
    const before = JSON.parse(JSON.stringify(full));
    applyAttempt(full, marker);
    expect(full).toEqual(before);
  });

  it("replaces an older marker rather than stacking", () => {
    const next: AttemptMarker = { at: "2026-11-01T00:00:00.000Z", outcome: "failed", reason: "x" };
    expect(applyAttempt({ ...full, enrichAttempt: marker }, next).enrichAttempt).toEqual(next);
  });

  it("caches a resolved website only when the lead has none, never overwriting an imported one", () => {
    const withSite: AttemptMarker = { ...marker, outcome: "unreachable", website: "https://resolved.example.com" };
    expect(applyAttempt(full, withSite).website).toBe("https://resolved.example.com");
    expect(applyAttempt({ ...full, website: "https://imported.example.com" }, withSite).website).toBe("https://imported.example.com");
    // a junk imported website counts as absent (cleanWebsite), so the resolved one is cached
    expect(applyAttempt({ ...full, website: "not a url" }, withSite).website).toBe("https://resolved.example.com");
  });

  it("survives a null or non-object meta", () => {
    expect(applyAttempt(null, marker)).toEqual({ enrichAttempt: marker });
    expect(applyAttempt([1, 2], marker)).toEqual({ enrichAttempt: marker });
  });
});

describe("enrichCandidates: no usable location (reject before the paid call)", () => {
  const noState = { ...cand("a"), state: null };

  it("skips a null-state lead: Places is never called, a marker is written", async () => {
    const deps = goodDeps();
    const stats = await enrichCandidates([noState], { dry: false, deps });
    expect(deps.resolveWebsite).not.toHaveBeenCalled();
    expect(deps.fetchSiteText).not.toHaveBeenCalled();
    expect(markerAt(deps)).toMatchObject({ outcome: "no-location" });
    expect(stats).toMatchObject({ noLocation: 1, placesCalls: 0, failed: 0, noSite: 0 });
  });

  it("also skips a blank state or a null/blank city (Places can never return HIGH without both)", async () => {
    const deps = goodDeps();
    const stats = await enrichCandidates(
      [{ ...cand("a"), state: "  " }, { ...cand("b"), city: null }, { ...cand("c"), city: "" }],
      { dry: false, deps }
    );
    expect(deps.resolveWebsite).not.toHaveBeenCalled();
    expect(stats).toMatchObject({ noLocation: 3, placesCalls: 0 });
  });

  it("does not block a lead that already has a cached website: no Places call is needed, so none is skipped", async () => {
    const deps = goodDeps();
    const stats = await enrichCandidates([{ ...noState, cachedWebsite: "https://a.example.com" }], { dry: false, deps });
    expect(deps.resolveWebsite).not.toHaveBeenCalled();
    expect(deps.fetchSiteText).toHaveBeenCalledWith("https://a.example.com");
    expect(stats).toMatchObject({ enriched: 1, noLocation: 0 });
  });

  it("passes non-null city and state to Places for a normal lead", async () => {
    const deps = goodDeps();
    await enrichCandidates([cand("a")], { dry: false, deps });
    expect(deps.resolveWebsite).toHaveBeenCalledWith({ name: "Co a", city: "Orlando", state: "FL" });
  });
});

describe("enrichCandidates: circuit breaker", () => {
  const many = (n: number) => Array.from({ length: n }, (_, i) => cand(`L${i}`));

  it("the threshold is five", () => {
    expect(MAX_CONSECUTIVE_FAILURES).toBe(5);
  });

  it("aborts after 5 consecutive failures and leaves the remaining leads untouched", async () => {
    const resolveWebsite = vi.fn().mockRejectedValue(new Error("Places 403 key invalid"));
    const deps = goodDeps({ resolveWebsite });
    const logs: string[] = [];
    const stats = await enrichCandidates(many(8), { dry: false, deps, log: (l) => logs.push(l) });
    expect(stats).toMatchObject({ selected: 8, attempted: 5, failed: 5, placesCalls: 5 });
    expect(resolveWebsite).toHaveBeenCalledTimes(5);
    expect(stats.aborted).toContain("5 consecutive failures");
    expect(stats.aborted).toContain("Places 403 key invalid");
    // the 3 untouched leads got no Places call and no marker
    const marked = (deps.markAttempt as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    expect(marked).toEqual(["L0", "L1", "L2", "L3", "L4"]);
    expect(logs.some((l) => l.includes("ABORTED"))).toBe(true);
  });

  it("4 failures then a success does not abort, and the success resets the counter", async () => {
    const extractEnrichment = vi.fn()
      .mockRejectedValueOnce(new Error("e1")).mockRejectedValueOnce(new Error("e2"))
      .mockRejectedValueOnce(new Error("e3")).mockRejectedValueOnce(new Error("e4"))
      .mockResolvedValueOnce({ enrichment: {}, inputTokens: 1, outputTokens: 1 })
      .mockRejectedValueOnce(new Error("e6")).mockRejectedValueOnce(new Error("e7"))
      .mockRejectedValueOnce(new Error("e8")).mockRejectedValueOnce(new Error("e9"));
    const cands = Array.from({ length: 9 }, (_, i) => cand(`L${i}`, `site${i}.example.com`));
    const stats = await enrichCandidates(cands, { dry: false, deps: goodDeps({ extractEnrichment }) });
    // 4 fail, 1 success, 4 fail: 8 failures in total but never 5 in a row
    expect(stats).toMatchObject({ attempted: 9, enriched: 1, failed: 8, aborted: null });
  });

  it("skipped leads (no-site) between failures neither reset nor add to the count", async () => {
    // L0..L2 fail; L3 is a no-site; L4 and L5 fail: 5 failures with a skip in the middle
    const resolveWebsite = vi.fn(async (i: { name: string }) =>
      i.name === "Co L3" ? { website: null, confidence: "LOW" as const } : { website: "https://found.example.com", confidence: "HIGH" as const });
    const extractEnrichment = vi.fn().mockRejectedValue(new Error("model key invalid"));
    const stats = await enrichCandidates(many(9), { dry: false, deps: goodDeps({ resolveWebsite, extractEnrichment }) });
    expect(stats).toMatchObject({ attempted: 6, failed: 5, noSite: 1 });
    expect(stats.aborted).toContain("model key invalid");
  });

  it("aborts when the database write fails every time (persist throws)", async () => {
    const persist = vi.fn().mockRejectedValue(new Error("db write failed"));
    const stats = await enrichCandidates(
      Array.from({ length: 7 }, (_, i) => cand(`L${i}`, `s${i}.example.com`)),
      { dry: false, deps: goodDeps({ persist }) }
    );
    expect(stats).toMatchObject({ attempted: 5, failed: 5 });
    expect(stats.aborted).toContain("db write failed");
  });

  it("a run that finishes normally reports aborted null", async () => {
    const stats = await enrichCandidates(many(3), { dry: false, deps: goodDeps() });
    expect(stats.aborted).toBeNull();
  });
});
