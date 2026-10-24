// packages/database/scripts/enrich-dealers.ts
/**
 * Tier-capped enrichment + scoring of imported dealer-list leads (Task 12).
 * Enrichment costs real money per lead (a Places call and two model calls), so
 * this NEVER runs wholesale: --max-tier and --limit are both required.
 *
 *   cd packages/database
 *   npx tsx scripts/enrich-dealers.ts --batch <importBatchId> --max-tier 2 --limit 20 [--dry]
 *
 *   --batch <id>     ImportBatch the dealer leads were imported under (required;
 *                    comma-separate several, e.g. a smoke-test batch plus the main one)
 *   --max-tier N     keep leads whose meta.tier <= N (2 is the best tier) (required)
 *   --limit N        process at most N leads, after the tier cut and after the
 *                    already-enriched skip (required; use --limit all to lift it)
 *   --dry            print the selection and exit. Makes ZERO network calls to
 *                    Places, a website, or the model: the code returns before any
 *                    key is read or any client is built (the only I/O is the
 *                    read-only database SELECT that finds the candidates).
 *
 * Resume: a lead that already has `enrichment` is never selected, and a lead
 * that failed is never written, so an interrupted run can simply be re-run.
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
import { emptyStats, enrichCandidates, selectCandidates, type EnrichDeps } from "../../services/src/dealer-enrich";

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

async function main() {
  const DRY = process.argv.includes("--dry");
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

  // Narrow read: five columns, scoped to one batch, already-enriched rows excluded
  // in SQL. meta.tier is JSON, which Prisma cannot filter or order on, so the
  // tier cut and the limit are applied in TypeScript.
  const rows = await db.lead.findMany({
    where: { importBatchId: { in: batchIds }, source: "PROSPECTING", enrichment: { equals: Prisma.DbNull } },
    select: { id: true, companyName: true, city: true, state: true, meta: true },
  });
  const candidates = selectCandidates(rows, { maxTier, limit });
  const byTier: Record<number, number> = {};
  for (const c of candidates) byTier[c.tier] = (byTier[c.tier] ?? 0) + 1;
  const withSite = candidates.filter((c) => c.cachedWebsite).length;

  console.log(`batch ${batchId}: ${rows.length} un-enriched dealer-batch leads read`);
  console.log(`selected ${candidates.length} (max-tier ${maxTier}, limit ${limit ?? "all"}) by tier ${JSON.stringify(byTier)}`);
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
    data: { source: "WEB_SCRAPE", params: { task: "enrich-dealers", batchId, maxTier, limit: limit ?? "all" } },
  });
  console.log(`SourceRun ${run.id}`);

  const deps: EnrichDeps = {
    resolveWebsite: (i) => resolveWebsite(i),
    fetchSiteText: (u) => fetchSiteText(u),
    extractEnrichment: (t, n) => extractEnrichment(t, n),
    scoreProspect: (i) => scoreProspect({ companyName: i.companyName, state: i.state, enrichment: i.enrichment as never }),
    persist: async (leadId, { enrichment, verdict }) => {
      await db.lead.update({
        where: { id: leadId },
        data: {
          pool: verdict.pool as never, confidence: verdict.confidence as never, productLine: verdict.productLine as never,
          score: verdict.score, scoreReasons: verdict.checks as Prisma.InputJsonValue,
          enrichment: enrichment as Prisma.InputJsonValue, sourceRunId: run.id,
        },
      });
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
          task: "enrich-dealers", batchId, maxTier, limit: limit ?? "all",
          selected: stats.selected, attempted: stats.attempted, enriched: stats.enriched, noSite: stats.noSite,
          unreachable: stats.unreachable, failed: stats.failed, cachedWebsite: stats.cachedWebsite,
          resolvedWebsite: stats.resolvedWebsite, placesCalls: stats.placesCalls, pools: stats.pools,
        },
      },
    });
  }

  const perLead = stats.attempted ? stats.attempted : 1;
  console.log("\n--- summary ---");
  console.log(`attempted ${stats.attempted}: enriched ${stats.enriched}, no site ${stats.noSite}, unreachable ${stats.unreachable}, failed ${stats.failed}`);
  console.log(`website source: ${stats.cachedWebsite} cached (meta.website), ${stats.resolvedWebsite} newly resolved, ${stats.placesCalls} Places calls`);
  console.log(`pools ${JSON.stringify(stats.pools)}`);
  console.log(`tokens in ${stats.inputTokens} out ${stats.outputTokens}; Places $${(stats.placesCalls * PLACES_COST_PER_CALL_USD).toFixed(3)}; per attempted lead: in ${(stats.inputTokens / perLead).toFixed(0)} out ${(stats.outputTokens / perLead).toFixed(0)} places ${(stats.placesCalls / perLead).toFixed(2)}`);
  for (const f of stats.failures) console.log(`  failure: ${f.companyName}: ${f.reason}`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => db.$disconnect());
