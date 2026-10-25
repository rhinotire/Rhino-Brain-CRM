// packages/database/scripts/enrich-dealers.ts
/**
 * Tier-capped enrichment + scoring of imported dealer-list leads (Task 12).
 * Enrichment costs real money per lead (a Places call and two model calls), so
 * this NEVER runs wholesale: --max-tier and --limit are both required.
 *
 *   cd packages/database
 *   npx tsx scripts/enrich-dealers.ts --batch <importBatchId> --max-tier 2 --limit 20 [--dry] [--retry-skipped]
 *
 *   --batch <id>     ImportBatch the dealer leads were imported under (required;
 *                    comma-separate several, e.g. a smoke-test batch plus the main one)
 *   --max-tier N     keep leads whose meta.tier <= N. Tier 1 is the best tier and
 *                    larger numbers are weaker, so a higher N lets weaker leads in
 *                    (required)
 *   --limit N        process at most N leads, after the tier cut and after the
 *                    already-enriched / already-attempted skips (required; use
 *                    --limit all to lift it)
 *   --retry-skipped  also select leads that carry an enrichAttempt marker (see Resume).
 *                    Off by default: it re-pays Places for every lead that earlier
 *                    ended no-site, and re-spends model tokens on unreachable/failed ones.
 *   --dry            print the selection and exit. Makes ZERO network calls to
 *                    Places, a website, or the model: the code returns before any
 *                    key is read or any client is built (the only I/O is the
 *                    read-only database SELECT that finds the candidates).
 *
 * Resume: a lead that already has `enrichment` is never selected, and neither is
 * a lead that carries a `meta.enrichAttempt` marker. Every terminal outcome
 * (enriched, no-site, unreachable, no-location, failed) writes that marker
 * ({ at, outcome, website?, reason? }) MERGED into the existing meta, so
 * meta.tier and the import keys survive. An interrupted run can simply be
 * re-run: leads it never reached have no marker and are still selected. A
 * HIGH-confidence resolved website is also cached in meta.website, so even a
 * --retry-skipped run does not pay Places for it again.
 * Leads with no locationId (parked Canada / non-home-state) are never selected:
 * no rep can see them, so enriching one buys nothing. A lead with no city or
 * state and no cached website is marked no-location without calling Places.
 * Circuit breaker: 5 consecutive failures abort the run (printed loudly, exit
 * code 1, and recorded as params.aborted on the SourceRun).
 * Website: meta.website is used when present; Places is called only when it is
 * absent (and only a HIGH-confidence match is fetched).
 * Ledger: one SourceRun (source WEB_SCRAPE, there is no dealer-list enum value)
 * with token counts and the Places cost; batch id, tier cut and limit are in
 * params. No SourceRun under --dry.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Prisma } from "@prisma/client";
import { db } from "../src";
import {
  applyAttempt, emptyStats, enrichCandidates, hasAttemptMarker, selectCandidates,
  type AttemptMarker, type EnrichDeps,
} from "../../services/src/dealer-enrich";
import type { Enrichment } from "../../services/src/prospect-enrich";
import type { ProspectVerdict } from "../../services/src/prospect-score";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

// same env fallback as run-prospecting.ts: Prisma loads .env for its own use only
function ensureEnv(name: string) {
  if (process.env[name]) return;
  try {
    const env = readFileSync(join(__dirname, "..", ".env"), "utf8");
    const m = env.match(new RegExp(`^${name}="?([^"\\n]+)"?`, "m"));
    if (m) process.env[name] = m[1];
  } catch { /* handled by the explicit checks in main() */ }
}

function fail(msg: string): never {
  console.error(msg);
  process.exit(2);
}

// Merge a marker into the lead's CURRENT meta (read fresh, not the copy taken at
// selection time, which may be minutes old). Never overwrites: see applyAttempt.
async function mergedMeta(leadId: string, marker: AttemptMarker): Promise<Prisma.InputJsonValue> {
  const cur = await db.lead.findUnique({ where: { id: leadId }, select: { meta: true } });
  return applyAttempt(cur?.meta, marker) as Prisma.InputJsonValue;
}

async function main() {
  const DRY = process.argv.includes("--dry");
  const retrySkipped = process.argv.includes("--retry-skipped");
  const batchArg = arg("batch");
  const batchIds = (batchArg ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const batchId = batchIds.join(",");
  if (batchIds.length === 0) fail("--batch <importBatchId[,id2...]> is required");
  const maxTierRaw = arg("max-tier");
  const maxTier = Number(maxTierRaw);
  if (!maxTierRaw || !Number.isInteger(maxTier) || maxTier < 1) fail("--max-tier <integer >= 1> is required");
  const limitRaw = arg("limit");
  if (!limitRaw) fail("--limit <N|all> is required (this script never runs unbounded by accident)");
  const limit = limitRaw === "all" ? null : Number(limitRaw);
  if (limit !== null && (!Number.isInteger(limit) || limit < 1)) fail("--limit must be a positive integer or 'all'");

  // Narrow read: six columns, scoped to one batch, already-enriched rows excluded
  // in SQL. Prisma cannot filter or order on JSON, so the tier cut, the attempt
  // marker, locationId and the limit are applied in TypeScript.
  const rows = await db.lead.findMany({
    where: { importBatchId: { in: batchIds }, source: "PROSPECTING", enrichment: { equals: Prisma.DbNull } },
    select: { id: true, companyName: true, city: true, state: true, locationId: true, meta: true },
  });
  const candidates = selectCandidates(rows, { maxTier, limit, retrySkipped });
  const alreadyAttempted = rows.filter((r) => hasAttemptMarker(r.meta)).length;
  const byTier: Record<number, number> = {};
  for (const c of candidates) byTier[c.tier] = (byTier[c.tier] ?? 0) + 1;
  const withSite = candidates.filter((c) => c.cachedWebsite).length;

  console.log(`batch ${batchId}: ${rows.length} un-enriched dealer-batch leads read`);
  console.log(`selected ${candidates.length} (max-tier ${maxTier}, limit ${limit ?? "all"}${retrySkipped ? ", retry-skipped" : ""}) by tier ${JSON.stringify(byTier)}`);
  if (!retrySkipped && alreadyAttempted > 0) {
    console.log(`  ${alreadyAttempted} already attempted in an earlier run (enrichAttempt marker) were left out; --retry-skipped includes them`);
  }
  console.log(`  ${withSite} carry a cached meta.website, ${candidates.length - withSite} would need a Places lookup`);
  if (DRY) {
    console.log("DRY RUN: no Places, website or model call was made; nothing was written.");
    return;
  }
  if (candidates.length === 0) {
    console.log("Nothing to enrich.");
    return;
  }

  // ---- everything below is reachable only when NOT --dry ----
  ensureEnv("GOOGLE_PLACES_API_KEY");
  ensureEnv("ANTHROPIC_API_KEY");
  if (!process.env.GOOGLE_PLACES_API_KEY) fail("GOOGLE_PLACES_API_KEY not set");
  if (!process.env.ANTHROPIC_API_KEY) fail("ANTHROPIC_API_KEY not set");
  const { resolveWebsite } = await import("../../services/src/website-resolve");
  const { fetchSiteText, extractEnrichment } = await import("../../services/src/prospect-enrich");
  const { scoreProspect } = await import("../../services/src/prospect-score");
  const { PLACES_COST_PER_CALL_USD } = await import("../../services/src/places-collector");

  const run = await db.sourceRun.create({
    data: { source: "WEB_SCRAPE", params: { task: "enrich-dealers", batchId, maxTier, limit: limit ?? "all", retrySkipped } },
  });
  console.log(`SourceRun ${run.id}`);

  // Typed with the real Enrichment / ProspectVerdict so the Prisma write below is
  // checked by the compiler. (These used to be cast through `never`, which hides an
  // invalid enum value until the write throws, after the money is spent.)
  const deps: EnrichDeps<Enrichment, ProspectVerdict> = {
    resolveWebsite: (i) => resolveWebsite(i),
    fetchSiteText: (u) => fetchSiteText(u),
    extractEnrichment: (t, n) => extractEnrichment(t, n),
    scoreProspect: (i) => scoreProspect(i),
    persist: async (leadId, { enrichment, verdict, marker }) => {
      await db.lead.update({
        where: { id: leadId },
        data: {
          pool: verdict.pool, confidence: verdict.confidence, productLine: verdict.productLine,
          score: verdict.score, scoreReasons: verdict.checks as Prisma.InputJsonValue,
          enrichment: enrichment as Prisma.InputJsonValue, sourceRunId: run.id,
          meta: await mergedMeta(leadId, marker),
        },
      });
    },
    markAttempt: async (leadId, marker) => {
      await db.lead.update({ where: { id: leadId }, data: { meta: await mergedMeta(leadId, marker) } });
    },
  };

  const stats = emptyStats(candidates.length); // mutated in place, so the ledger below sees partial progress even on a crash
  try {
    await enrichCandidates(candidates, { dry: false, deps, log: console.log, stats });
  } finally {
    // Always flush the ledger, even on a crash, as prospect-pipeline.ts does.
    await db.sourceRun.update({
      where: { id: run.id },
      data: {
        resultCount: stats.enriched,
        apiCostUsd: stats.placesCalls * PLACES_COST_PER_CALL_USD,
        inputTokens: stats.inputTokens,
        outputTokens: stats.outputTokens,
        params: {
          task: "enrich-dealers", batchId, maxTier, limit: limit ?? "all", retrySkipped,
          aborted: stats.aborted, selected: stats.selected, attempted: stats.attempted, enriched: stats.enriched, noSite: stats.noSite,
          unreachable: stats.unreachable, noLocation: stats.noLocation, failed: stats.failed, cachedWebsite: stats.cachedWebsite,
          resolvedWebsite: stats.resolvedWebsite, placesCalls: stats.placesCalls, pools: stats.pools,
        },
      },
    });
  }

  if (stats.aborted) {
    console.error(`\n!!! RUN ABORTED EARLY: ${stats.aborted}`);
    console.error(`!!! ${stats.selected - stats.attempted} of ${stats.selected} selected leads were not touched. Fix the cause, then re-run; the leads that failed carry an attempt marker, so add --retry-skipped to include them.`);
    process.exitCode = 1;
  }
  const perLead = stats.attempted ? stats.attempted : 1;
  console.log("\n--- summary ---");
  console.log(`attempted ${stats.attempted} of ${stats.selected}: enriched ${stats.enriched}, no site ${stats.noSite}, unreachable ${stats.unreachable}, no city/state ${stats.noLocation}, failed ${stats.failed}`);
  console.log(`website source: ${stats.cachedWebsite} cached (meta.website), ${stats.resolvedWebsite} newly resolved, ${stats.placesCalls} Places calls`);
  console.log(`pools ${JSON.stringify(stats.pools)}`);
  console.log(`tokens in ${stats.inputTokens} out ${stats.outputTokens}; Places $${(stats.placesCalls * PLACES_COST_PER_CALL_USD).toFixed(3)}; per attempted lead: in ${(stats.inputTokens / perLead).toFixed(0)} out ${(stats.outputTokens / perLead).toFixed(0)} places ${(stats.placesCalls / perLead).toFixed(2)}`);
  for (const f of stats.failures) console.log(`  failure: ${f.companyName}: ${f.reason}`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => db.$disconnect());
