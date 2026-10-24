/**
 * Tier-capped enrichment of imported dealer leads (dealer-list activation,
 * Task 12). Pure orchestration with every side effect injected, so the two
 * properties that protect the owner's money can be unit-tested:
 *
 *   1. a dry run touches NOTHING outside the selection (deps are never called);
 *   2. one bad lead never aborts the run, and an interrupted run can be re-run
 *      without paying twice (leads that already have `enrichment` are never
 *      selected; leads that failed are never written, so they stay eligible).
 *
 * The CLI wrapper is packages/database/scripts/enrich-dealers.ts. The flow per
 * lead mirrors prospect-pipeline.ts: fetch -> enrich -> score -> persist.
 * Server-side only; deliberately not re-exported from the services index.
 */

export const DEALER_IMPORT_SOURCE = "dealer-locators";

/** The few columns selection needs. Never the full Lead row. */
export type CandidateRow = {
  id: string;
  companyName: string;
  city: string | null;
  state: string | null;
  meta: unknown;
};

export type Candidate = {
  id: string;
  companyName: string;
  city: string | null;
  state: string | null;
  tier: number;
  /** meta.website when the import carried one, else null. */
  cachedWebsite: string | null;
};

const asRecord = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/** A usable cached website: a non-empty single token containing a dot. */
export function cleanWebsite(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s || s.includes(" ") || !s.includes(".")) return null;
  return s;
}

/**
 * Keep only dealer-list leads at or above the tier cut (tier 2 is the best,
 * so "at or above" means tier <= maxTier), best tier first with a stable id
 * tiebreak, then cap at `limit`. The tier lives in meta JSON, which Prisma
 * cannot order on, hence this runs in TypeScript over the narrow rows.
 * Leads with a missing/non-integer tier are excluded, never guessed.
 */
export function selectCandidates(rows: CandidateRow[], opts: { maxTier: number; limit: number | null }): Candidate[] {
  const out: Candidate[] = [];
  for (const r of rows) {
    const meta = asRecord(r.meta);
    if (meta.importSource !== DEALER_IMPORT_SOURCE) continue;
    const tier = meta.tier;
    if (typeof tier !== "number" || !Number.isInteger(tier) || tier > opts.maxTier) continue;
    out.push({
      id: r.id,
      companyName: r.companyName,
      city: r.city,
      state: r.state,
      tier,
      cachedWebsite: cleanWebsite(meta.website),
    });
  }
  out.sort((a, b) => a.tier - b.tier || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return opts.limit === null ? out : out.slice(0, opts.limit);
}

// ---- injected side effects (the real implementations are in the script) ----

export type Verdict = {
  pool: string;
  confidence: string;
  productLine: string;
  score: number;
  checks: unknown;
};

export type EnrichDeps = {
  resolveWebsite: (input: { name: string; city: string | null; state: string | null }) => Promise<{ website: string | null; confidence: "HIGH" | "LOW" }>;
  fetchSiteText: (url: string) => Promise<string>;
  extractEnrichment: (siteText: string, companyName: string) => Promise<{ enrichment: object; inputTokens: number; outputTokens: number }>;
  scoreProspect: (input: { companyName: string; state: string | null; enrichment: object }) => Promise<{ verdict: Verdict; inputTokens: number; outputTokens: number }>;
  persist: (leadId: string, result: { enrichment: object; verdict: Verdict }) => Promise<void>;
};

export type RunStats = {
  selected: number;
  attempted: number;
  enriched: number;
  /** a Places lookup returned no HIGH-confidence website; nothing was spent past Places */
  noSite: number;
  /** a website was known but its page would not load; no LLM spend */
  unreachable: number;
  /** threw: Places error, model junk, DB write error */
  failed: number;
  cachedWebsite: number;
  resolvedWebsite: number;
  placesCalls: number;
  inputTokens: number;
  outputTokens: number;
  pools: Record<string, number>;
  failures: { id: string; companyName: string; reason: string }[];
};

export const emptyStats = (selected: number): RunStats => ({
  selected, attempted: 0, enriched: 0, noSite: 0, unreachable: 0, failed: 0,
  cachedWebsite: 0, resolvedWebsite: 0, placesCalls: 0, inputTokens: 0, outputTokens: 0,
  pools: {}, failures: [],
});

/**
 * Process the candidates. `dry` returns before `deps` is ever dereferenced:
 * no Places call, no page fetch, no model call, no write.
 */
export async function enrichCandidates(
  candidates: Candidate[],
  opts: { dry: boolean; deps: EnrichDeps | null; log?: (line: string) => void; /** caller-owned, mutated in place so a crash still leaves partial totals for the ledger */ stats?: RunStats }
): Promise<RunStats> {
  const log = opts.log ?? (() => undefined);
  const stats = opts.stats ?? emptyStats(candidates.length);
  if (opts.dry) return stats;
  const deps = opts.deps;
  if (!deps) throw new Error("enrichCandidates: deps are required for a non-dry run");

  for (const c of candidates) {
    stats.attempted++;
    const label = `${c.companyName} (${c.city ?? "?"}, ${c.state ?? "?"}) t${c.tier}`;
    try {
      let website = c.cachedWebsite;
      if (website) {
        stats.cachedWebsite++;
      } else {
        stats.placesCalls++; // counted before the call: a failed call may still bill
        const res = await deps.resolveWebsite({ name: c.companyName, city: c.city, state: c.state });
        // A wrong site feeds a wrong score, so LOW-confidence matches are not fetched.
        website = res.confidence === "HIGH" ? res.website : null;
        if (website) stats.resolvedWebsite++;
      }
      if (!website) {
        stats.noSite++;
        log(`- no site: ${label}`);
        continue;
      }
      const siteText = await deps.fetchSiteText(website);
      if (!siteText) {
        stats.unreachable++;
        log(`- unreachable: ${label} ${website}`);
        continue;
      }
      const enr = await deps.extractEnrichment(siteText, c.companyName);
      stats.inputTokens += enr.inputTokens;
      stats.outputTokens += enr.outputTokens;
      const sc = await deps.scoreProspect({ companyName: c.companyName, state: c.state, enrichment: enr.enrichment });
      stats.inputTokens += sc.inputTokens;
      stats.outputTokens += sc.outputTokens;
      await deps.persist(c.id, { enrichment: enr.enrichment, verdict: sc.verdict });
      stats.enriched++;
      stats.pools[sc.verdict.pool] = (stats.pools[sc.verdict.pool] ?? 0) + 1;
      log(`+ ${label} [${sc.verdict.pool}/${sc.verdict.confidence}] score=${sc.verdict.score}`);
    } catch (e) {
      stats.failed++;
      const reason = e instanceof Error ? e.message : String(e);
      stats.failures.push({ id: c.id, companyName: c.companyName, reason });
      log(`! failed ${label}: ${reason}`);
    }
  }
  return stats;
}
