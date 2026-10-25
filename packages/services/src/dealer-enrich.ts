/**
 * Tier-capped enrichment of imported dealer leads (dealer-list activation,
 * Task 12). Pure orchestration with every side effect injected, so the
 * properties that protect the owner's money can be unit-tested:
 *
 *   1. a dry run touches NOTHING outside the selection (deps are never called);
 *   2. one bad lead never aborts the run, but FIVE failures in a row do
 *      (an invalid key or a dead database would otherwise bill a Places call
 *      per lead for nothing);
 *   3. paid work is remembered. Every terminal outcome (enriched, no-site,
 *      unreachable, no-location, failed) leaves an `enrichAttempt` marker in
 *      the lead's meta, and a resolved website is cached in meta.website.
 *      Selection skips marked leads, so a re-run never re-pays for them.
 *      `retrySkipped` opts back in.
 *
 * The CLI wrapper is packages/database/scripts/enrich-dealers.ts. The flow per
 * lead mirrors prospect-pipeline.ts: fetch -> enrich -> score -> persist.
 * Server-side only; deliberately not re-exported from the services index, and
 * deliberately import-free (see the build rules: a value import from a module
 * that pulls @prisma/client into client-reachable code crashes production).
 */

export const DEALER_IMPORT_SOURCE = "dealer-locators";

/** Abort the run after this many failures in a row (see enrichCandidates). */
export const MAX_CONSECUTIVE_FAILURES = 5;

/** The few columns selection needs. Never the full Lead row. */
export type CandidateRow = {
  id: string;
  companyName: string;
  city: string | null;
  state: string | null;
  /** null = parked (Canada / non-home-state); no rep can ever see the lead. */
  locationId: string | null;
  meta: unknown;
};

export type Candidate = {
  id: string;
  companyName: string;
  city: string | null;
  state: string | null;
  tier: number;
  /** meta.website when the import (or an earlier run) carried one, else null. */
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

// ---- attempt marker: how paid work is remembered across runs ----

/** How one lead's attempt ended. */
export type AttemptOutcome = "enriched" | "no-site" | "unreachable" | "no-location" | "failed";

/**
 * Stored at `Lead.meta.enrichAttempt`. Its mere presence (any non-null value)
 * excludes the lead from selection, so it fails safe: an odd or hand-written
 * marker still stops spending. `--retry-skipped` is the only way back in.
 *   at       ISO timestamp of the attempt
 *   outcome  how it ended (see AttemptOutcome)
 *   website  the trusted website used (cached, or resolved at HIGH confidence);
 *            never a LOW-confidence guess
 *   reason   failed only: the error message, truncated
 */
export type AttemptMarker = { at: string; outcome: AttemptOutcome; website?: string; reason?: string };

export const hasAttemptMarker = (meta: unknown): boolean => {
  const m = asRecord(meta).enrichAttempt;
  return m !== undefined && m !== null;
};

/**
 * The meta to write after an attempt: the existing meta with `enrichAttempt`
 * added, never replaced wholesale (meta.tier orders the sales queue; losing
 * it, or importSource/brands/etc., would be a serious regression). A trusted
 * website is cached in meta.website only when the lead has none, so a re-run
 * does not pay Places for it again and an import-supplied site is never
 * overwritten.
 */
export function applyAttempt(meta: unknown, marker: AttemptMarker): Record<string, unknown> {
  const base = asRecord(meta);
  const merged: Record<string, unknown> = { ...base, enrichAttempt: marker };
  if (marker.website && !cleanWebsite(base.website)) merged.website = marker.website;
  return merged;
}

/**
 * Keep only dealer-list leads that are worth paying for, best tier first with
 * a stable id tiebreak, then cap at `limit`. The tier lives in meta JSON,
 * which Prisma cannot order or filter on, hence this runs in TypeScript over
 * the narrow rows.
 *
 * Tier 1 is the best tier and larger numbers are weaker, so the cut keeps
 * tier <= maxTier and the sort is ascending. Excluded, never guessed:
 *   - other import sources, and a missing or non-integer tier;
 *   - locationId null: parked Canada / non-home-state leads never surface in
 *     any rep queue, so enriching one spends money no human will ever see;
 *   - leads carrying an enrichAttempt marker, unless `retrySkipped` is set.
 */
export function selectCandidates(
  rows: CandidateRow[],
  opts: { maxTier: number; limit: number | null; retrySkipped?: boolean }
): Candidate[] {
  const out: Candidate[] = [];
  for (const r of rows) {
    if (r.locationId === null) continue;
    const meta = asRecord(r.meta);
    if (meta.importSource !== DEALER_IMPORT_SOURCE) continue;
    if (!opts.retrySkipped && hasAttemptMarker(meta)) continue;
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

/**
 * `E` and `V` let the script bind the real Enrichment and ProspectVerdict
 * types, so the Prisma write is type-checked instead of cast through `never`.
 */
export type EnrichDeps<E extends object = object, V extends Verdict = Verdict> = {
  /**
   * Must stay assignable to the real resolveWebsite (website-resolve.ts), which
   * takes non-null city and state and throws on a null one AFTER the Places
   * call is billed. enrichCandidates therefore never calls this without both.
   */
  resolveWebsite: (input: { name: string; city: string; state: string }) => Promise<{ website: string | null; confidence: "HIGH" | "LOW" }>;
  fetchSiteText: (url: string) => Promise<string>;
  extractEnrichment: (siteText: string, companyName: string) => Promise<{ enrichment: E; inputTokens: number; outputTokens: number }>;
  scoreProspect: (input: { companyName: string; state: string | null; enrichment: E }) => Promise<{ verdict: V; inputTokens: number; outputTokens: number }>;
  /** Writes the result AND the marker (outcome "enriched") in one update. */
  persist: (leadId: string, result: { enrichment: E; verdict: V; marker: AttemptMarker }) => Promise<void>;
  /** Records a terminal outcome that produced no enrichment. Must merge into meta (see applyAttempt). */
  markAttempt: (leadId: string, marker: AttemptMarker) => Promise<void>;
};

export type RunStats = {
  selected: number;
  attempted: number;
  enriched: number;
  /** a Places lookup returned no HIGH-confidence website; nothing was spent past Places */
  noSite: number;
  /** a website was known but its page would not load; no LLM spend */
  unreachable: number;
  /** no usable city/state, so Places could never return a HIGH match; skipped before any spend */
  noLocation: number;
  /** threw: Places error, model junk, DB write error */
  failed: number;
  cachedWebsite: number;
  resolvedWebsite: number;
  placesCalls: number;
  inputTokens: number;
  outputTokens: number;
  pools: Record<string, number>;
  failures: { id: string; companyName: string; reason: string }[];
  /** why the run stopped early (circuit breaker), else null. Leads after the stop point are untouched. */
  aborted: string | null;
};

export const emptyStats = (selected: number): RunStats => ({
  selected, attempted: 0, enriched: 0, noSite: 0, unreachable: 0, noLocation: 0, failed: 0,
  cachedWebsite: 0, resolvedWebsite: 0, placesCalls: 0, inputTokens: 0, outputTokens: 0,
  pools: {}, failures: [], aborted: null,
});

const MAX_REASON_CHARS = 200;
const hasText = (s: string | null): s is string => s !== null && s.trim() !== "";

/**
 * Process the candidates. `dry` returns before `deps` is ever dereferenced:
 * no Places call, no page fetch, no model call, no write.
 *
 * Circuit breaker: MAX_CONSECUTIVE_FAILURES failures in a row stop the run
 * (stats.aborted says why). Only a fully enriched lead resets the count. A
 * no-site / unreachable / no-location lead neither resets nor adds to it: it
 * proves nothing about the dependency that is failing (a dead model key stays
 * dead however many skipped leads sit between the failures), and resetting
 * on it would let a systematic failure keep billing Places.
 */
export async function enrichCandidates<E extends object = object, V extends Verdict = Verdict>(
  candidates: Candidate[],
  opts: { dry: boolean; deps: EnrichDeps<E, V> | null; log?: (line: string) => void; /** caller-owned, mutated in place so a crash still leaves partial totals for the ledger */ stats?: RunStats }
): Promise<RunStats> {
  const log = opts.log ?? (() => undefined);
  const stats = opts.stats ?? emptyStats(candidates.length);
  if (opts.dry) return stats;
  const deps = opts.deps;
  if (!deps) throw new Error("enrichCandidates: deps are required for a non-dry run");

  let consecutiveFailures = 0;
  for (const c of candidates) {
    stats.attempted++;
    const label = `${c.companyName} (${c.city ?? "?"}, ${c.state ?? "?"}) t${c.tier}`;
    // The trusted website for this lead: cached, or resolved at HIGH confidence.
    // Declared outside the try so a later failure still records (and caches) it.
    let website: string | null = c.cachedWebsite;
    try {
      if (website) {
        stats.cachedWebsite++;
      } else {
        // The real resolveWebsite needs both, throws on a null state only after
        // Places has billed, and can never return HIGH without either. Skip
        // before spending anything.
        if (!hasText(c.city) || !hasText(c.state)) {
          await deps.markAttempt(c.id, { at: new Date().toISOString(), outcome: "no-location" });
          stats.noLocation++;
          log(`- no city/state, skipped before Places: ${label}`);
          continue;
        }
        stats.placesCalls++; // counted before the call: a failed call may still bill
        const res = await deps.resolveWebsite({ name: c.companyName, city: c.city, state: c.state });
        // A wrong site feeds a wrong score, so LOW-confidence matches are not fetched
        // (and never cached: a cached site would skip this gate on the next run).
        website = res.confidence === "HIGH" ? res.website : null;
        if (website) stats.resolvedWebsite++;
      }
      if (!website) {
        await deps.markAttempt(c.id, { at: new Date().toISOString(), outcome: "no-site" });
        stats.noSite++;
        log(`- no site: ${label}`);
        continue;
      }
      const siteText = await deps.fetchSiteText(website);
      if (!siteText) {
        await deps.markAttempt(c.id, { at: new Date().toISOString(), outcome: "unreachable", website });
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
      await deps.persist(c.id, {
        enrichment: enr.enrichment,
        verdict: sc.verdict,
        marker: { at: new Date().toISOString(), outcome: "enriched", website },
      });
      stats.enriched++;
      consecutiveFailures = 0;
      stats.pools[sc.verdict.pool] = (stats.pools[sc.verdict.pool] ?? 0) + 1;
      log(`+ ${label} [${sc.verdict.pool}/${sc.verdict.confidence}] score=${sc.verdict.score}`);
    } catch (e) {
      stats.failed++;
      consecutiveFailures++;
      const reason = e instanceof Error ? e.message : String(e);
      stats.failures.push({ id: c.id, companyName: c.companyName, reason });
      log(`! failed ${label}: ${reason}`);
      // Remember the failure so a re-run does not pay for this lead again. If the
      // marker cannot be written either (a dead database), the lead stays
      // eligible and the circuit breaker below is what stops the spending.
      try {
        await deps.markAttempt(c.id, {
          at: new Date().toISOString(),
          outcome: "failed",
          reason: reason.slice(0, MAX_REASON_CHARS),
          ...(website ? { website } : {}),
        });
      } catch (markErr) {
        log(`! could not record the failed attempt for ${label}: ${markErr instanceof Error ? markErr.message : String(markErr)}`);
      }
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        stats.aborted = `${consecutiveFailures} consecutive failures, run stopped; last error: ${reason}`;
        log(`!!! ABORTED after ${stats.attempted} of ${candidates.length} leads: ${stats.aborted}`);
        break;
      }
    }
  }
  return stats;
}
