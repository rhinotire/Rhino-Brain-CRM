// packages/database/scripts/run-prospecting.ts
/**
 * Prospecting pipeline: Places sweep → exclusion filter → dedupe → enrich →
 * six-check score → Lead rows awaiting calibration in the CRM.
 *
 *   pnpm --filter @rhino/database exec tsx scripts/run-prospecting.ts --state TX --category p4 --limit 40
 *   --category p4|p3|p1  (P4 truck first — owner priority)
 *   --dry                collect + filter only, no AI, no writes
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { searchPlacesPage, PLACES_COST_PER_CALL_USD } from "../../services/src/places-collector";
import { dedupeKeyFor } from "../../services/src/prospect-dedupe";
import { matchesExclusion } from "../../services/src/exclusion-service";
import { fetchSiteText, extractEnrichment } from "../../services/src/prospect-enrich";
import { scoreProspect, assignStateLocation } from "../../services/src/prospect-score";

const db = new PrismaClient();

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
}
const DRY = process.argv.includes("--dry");
const STATE = (arg("state") ?? "").toUpperCase();
const CATEGORY = arg("category", "p4")!;
const LIMIT = Number(arg("limit", "40"));

// Search queries per product line (spec §7). P4 first.
const QUERIES: Record<string, string[]> = {
  p4: ["commercial truck tire dealer", "truck tire shop", "truck repair shop", "trucking company", "fleet services"],
  p3: ["tire wholesaler", "tire shop", "used and new tire dealer"],
  p1: ["trailer parts distributor", "trailer tires wholesale", "trailer manufacturer"],
};
const STATE_NAMES: Record<string, string> = {
  FL: "Florida", TX: "Texas", GA: "Georgia", AL: "Alabama", SC: "South Carolina", NC: "North Carolina",
  TN: "Tennessee", MS: "Mississippi", OK: "Oklahoma", LA: "Louisiana", AR: "Arkansas", NM: "New Mexico",
};

// same env fallback as ai-propose-specs.ts — Prisma loads .env for its own use
function ensureEnv(name: string) {
  if (process.env[name]) return;
  try {
    const env = readFileSync(join(__dirname, "..", ".env"), "utf8");
    const m = env.match(new RegExp(`^${name}="?([^"\\n]+)"?`, "m"));
    if (m) process.env[name] = m[1];
  } catch { /* fall through to the explicit check below */ }
}

async function main() {
  if (!STATE || !STATE_NAMES[STATE]) throw new Error(`--state must be one of: ${Object.keys(STATE_NAMES).join(", ")}`);
  if (!QUERIES[CATEGORY]) throw new Error(`--category must be one of: ${Object.keys(QUERIES).join(", ")}`);
  ensureEnv("GOOGLE_PLACES_API_KEY");
  ensureEnv("ANTHROPIC_API_KEY");
  const placesKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!placesKey) throw new Error("GOOGLE_PLACES_API_KEY not set");

  const exclusions = await db.exclusionList.findMany({ select: { kind: true, companyName: true, domain: true, phone: true } });
  const locByTag = async (tag: "FL" | "TX") => (await db.location.findFirst({ where: { shortTag: tag } }))?.id ?? null;
  const rhinoId = await locByTag("FL");
  const everflowId = await locByTag("TX");

  let apiCalls = 0, inTok = 0, outTok = 0, results = 0, created = 0, dups = 0, excluded = 0;
  const run = DRY ? null : await db.sourceRun.create({
    data: { source: "GOOGLE_PLACES", params: { state: STATE, category: CATEGORY, limit: LIMIT } },
  });

  outer:
  for (const q of QUERIES[CATEGORY]) {
    let pageToken: string | undefined;
    do {
      const page = await searchPlacesPage({ query: `${q} in ${STATE_NAMES[STATE]}`, apiKey: placesKey, pageToken });
      apiCalls++;
      pageToken = page.nextPageToken ?? undefined;
      for (const c of page.candidates) {
        if (results >= LIMIT) break outer;
        results++;
        if (matchesExclusion({ companyName: c.companyName, website: c.website, phone: c.phone }, exclusions)) { excluded++; continue; }
        const key = dedupeKeyFor({ website: c.website, phone: c.phone, companyName: c.companyName, city: c.city });
        if (!key) continue;
        if (await db.lead.findFirst({ where: { dedupeKey: key }, select: { id: true } })) { dups++; continue; }
        if (DRY) { console.log("would create:", c.companyName, c.city, c.state); continue; }

        const siteText = c.website ? await fetchSiteText(c.website) : "";
        const enr = await extractEnrichment(siteText, c.companyName);
        const sc = await scoreProspect({ companyName: c.companyName, state: c.state, enrichment: enr.enrichment });
        inTok += enr.inputTokens + sc.inputTokens;
        outTok += enr.outputTokens + sc.outputTokens;
        const wh = assignStateLocation(c.state);
        await db.lead.create({
          data: {
            companyName: c.companyName,
            phone: c.phone, city: c.city, state: c.state,
            email: enr.enrichment.emails[0] ?? null,
            type: "WHOLESALE_DEALER",
            source: "PROSPECTING",
            interest: sc.verdict.productLine === "P3_PCR" ? "PCR_TIRES" : sc.verdict.productLine === "P4_TBR" ? "TBR_TIRES" : sc.verdict.productLine === "P2_TRAILER_WHEEL" ? "WHEELS" : "TRAILER_TIRES",
            stage: "NEW_LEAD",
            pool: sc.verdict.pool, confidence: sc.verdict.confidence, productLine: sc.verdict.productLine,
            score: sc.verdict.score, scoreReasons: sc.verdict.checks,
            enrichment: enr.enrichment as object,
            dedupeKey: key, sourceRunId: run!.id,
            locationId: wh === "RHINO" ? rhinoId : wh === "EVERFLOW" ? everflowId : null,
            meta: { website: c.website, rating: c.rating, ratingCount: c.ratingCount, placesQuery: q },
          },
        });
        created++;
        console.log(`+ ${c.companyName} [${sc.verdict.pool}/${sc.verdict.confidence}] score=${sc.verdict.score}`);
      }
    } while (pageToken && results < LIMIT);
  }

  if (run) {
    await db.sourceRun.update({
      where: { id: run.id },
      data: {
        resultCount: results, newLeadCount: created, dupCount: dups, excludedCount: excluded,
        apiCostUsd: apiCalls * PLACES_COST_PER_CALL_USD, inputTokens: inTok, outputTokens: outTok,
      },
    });
  }
  console.log({ results, created, dups, excluded, apiCalls, inTok, outTok });
}

main().finally(() => db.$disconnect());
