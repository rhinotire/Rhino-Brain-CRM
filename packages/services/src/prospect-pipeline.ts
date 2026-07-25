import { db } from "@rhino/database";
import { searchPlacesPage, PLACES_COST_PER_CALL_USD } from "./places-collector";
import { dedupeKeyFor } from "./prospect-dedupe";
import { matchesExclusion } from "./exclusion-service";
import { fetchSiteText, extractEnrichment } from "./prospect-enrich";
import { scoreProspect, assignStateLocation } from "./prospect-score";

/**
 * Prospecting pipeline: Places sweep → exclusion filter → dedupe → enrich →
 * six-check score → Lead rows awaiting calibration. Shared by the CLI script
 * (packages/database/scripts/run-prospecting.ts) and the CRM's in-page
 * collection form. Always flushes the SourceRun cost ledger, even on a
 * mid-run crash; one bad candidate is skipped, never fatal.
 */
export type ProspectCategory = "p4" | "p3" | "p1";

// Search queries per product line (spec §7). P4 truck first — owner priority.
export const PROSPECT_QUERIES: Record<ProspectCategory, string[]> = {
  p4: ["commercial truck tire dealer", "truck tire shop", "truck repair shop", "trucking company", "fleet services"],
  p3: ["tire wholesaler", "tire shop", "used and new tire dealer"],
  p1: ["trailer parts distributor", "trailer tires wholesale", "trailer manufacturer"],
};

export const PROSPECT_STATE_NAMES: Record<string, string> = {
  FL: "Florida", TX: "Texas", GA: "Georgia", AL: "Alabama", SC: "South Carolina", NC: "North Carolina",
  TN: "Tennessee", MS: "Mississippi", OK: "Oklahoma", LA: "Louisiana", AR: "Arkansas", NM: "New Mexico",
};

// International markets for Qingdao Rhino Tyre (spec §1 L2/L3 tiers). Leads
// from non-US countries route to the Qingdao location (shortTag QD).
export const PROSPECT_COUNTRIES: Record<string, string> = {
  US: "United States",
  CA: "Canada", MX: "Mexico",
  DO: "Dominican Republic", PA: "Panama", CR: "Costa Rica", GT: "Guatemala", HN: "Honduras", JM: "Jamaica", TT: "Trinidad and Tobago",
  CO: "Colombia", PE: "Peru", CL: "Chile", EC: "Ecuador", BR: "Brazil",
  AE: "United Arab Emirates", SA: "Saudi Arabia",
  NG: "Nigeria", GH: "Ghana", KE: "Kenya", ZA: "South Africa",
  PH: "Philippines", TH: "Thailand", MY: "Malaysia",
  AU: "Australia", GB: "United Kingdom", DE: "Germany",
};

export type PipelineResult = {
  results: number; created: number; dups: number; excluded: number; skipped: number;
  apiCalls: number; inTok: number; outTok: number;
};

export async function runProspectingPipeline(opts: {
  /** ISO-ish code from PROSPECT_COUNTRIES; default "US" */
  country?: string;
  /** required when country is US; ignored otherwise */
  state?: string;
  category?: ProspectCategory;
  /** free-text search keywords — overrides the category presets */
  customQuery?: string;
  limit: number;
  placesKey: string;
  dry?: boolean;
  log?: (line: string) => void;
}): Promise<PipelineResult> {
  const log = opts.log ?? console.log;
  const COUNTRY = (opts.country ?? "US").toUpperCase();
  if (!PROSPECT_COUNTRIES[COUNTRY]) throw new Error(`country must be one of: ${Object.keys(PROSPECT_COUNTRIES).join(", ")}`);
  const STATE = COUNTRY === "US" ? (opts.state ?? "").toUpperCase() : "";
  if (COUNTRY === "US" && !PROSPECT_STATE_NAMES[STATE])
    throw new Error(`state (required for US) must be one of: ${Object.keys(PROSPECT_STATE_NAMES).join(", ")}`);
  const customQuery = opts.customQuery?.trim();
  if (!customQuery && (!opts.category || !PROSPECT_QUERIES[opts.category]))
    throw new Error(`category must be one of: ${Object.keys(PROSPECT_QUERIES).join(", ")} (or pass customQuery)`);
  if (customQuery && customQuery.length < 3) throw new Error("customQuery too short");
  const queries = customQuery ? [customQuery] : PROSPECT_QUERIES[opts.category!];
  const wherePhrase = COUNTRY === "US" ? PROSPECT_STATE_NAMES[STATE] : PROSPECT_COUNTRIES[COUNTRY];
  const DRY = !!opts.dry;
  if (!DRY && !process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not set (required for enrich/score on non-dry runs)");

  const exclusions = await db.exclusionList.findMany({ select: { kind: true, companyName: true, domain: true, phone: true } });
  const locByTag = async (tag: string) => (await db.location.findFirst({ where: { shortTag: tag } }))?.id ?? null;
  const rhinoId = await locByTag("FL");
  const everflowId = await locByTag("TX");
  const qingdaoId = await locByTag("QD"); // international leads belong to Qingdao Rhino Tyre

  let apiCalls = 0, inTok = 0, outTok = 0, results = 0, created = 0, dups = 0, excluded = 0, skipped = 0;
  const run = DRY ? null : await db.sourceRun.create({
    data: { source: "GOOGLE_PLACES", params: { country: COUNTRY, state: STATE || null, category: opts.category ?? null, customQuery: customQuery ?? null, limit: opts.limit } },
  });

  try {
    outer:
    for (const q of queries) {
      let pageToken: string | undefined;
      do {
        const page = await searchPlacesPage({ query: `${q} in ${wherePhrase}`, apiKey: opts.placesKey, pageToken });
        apiCalls++;
        pageToken = page.nextPageToken ?? undefined;
        for (const c of page.candidates) {
          if (results >= opts.limit) break outer;
          results++;
          if (matchesExclusion({ companyName: c.companyName, website: c.website, phone: c.phone }, exclusions)) { excluded++; continue; }
          const key = dedupeKeyFor({ website: c.website, phone: c.phone, companyName: c.companyName, city: c.city });
          if (!key) continue;
          if (await db.lead.findFirst({ where: { dedupeKey: key }, select: { id: true } })) { dups++; continue; }
          if (DRY) { log(`would create: ${c.companyName} ${c.city ?? ""} ${c.state ?? ""}`); continue; }

          try {
            const siteText = c.website ? await fetchSiteText(c.website) : "";
            const enr = await extractEnrichment(siteText, c.companyName);
            inTok += enr.inputTokens;
            outTok += enr.outputTokens;
            const sc = await scoreProspect({ companyName: c.companyName, state: c.state, enrichment: enr.enrichment });
            inTok += sc.inputTokens;
            outTok += sc.outputTokens;
            const wh = COUNTRY === "US" ? assignStateLocation(c.state) : null;
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
                country: COUNTRY,
                locationId: COUNTRY !== "US" ? qingdaoId : wh === "RHINO" ? rhinoId : wh === "EVERFLOW" ? everflowId : null,
                meta: { website: c.website, rating: c.rating, ratingCount: c.ratingCount, placesQuery: q },
              },
            });
            created++;
            log(`+ ${c.companyName} [${sc.verdict.pool}/${sc.verdict.confidence}] score=${sc.verdict.score}`);
          } catch (e) {
            skipped++;
            log(`! skipped ${c.companyName}: ${e instanceof Error ? e.message : e}`);
            continue;
          }
        }
      } while (pageToken && results < opts.limit);
    }
  } finally {
    if (run) {
      await db.sourceRun.update({
        where: { id: run.id },
        data: {
          resultCount: results, newLeadCount: created, dupCount: dups, excludedCount: excluded,
          apiCostUsd: apiCalls * PLACES_COST_PER_CALL_USD, inputTokens: inTok, outputTokens: outTok,
        },
      });
    }
  }
  return { results, created, dups, excluded, skipped, apiCalls, inTok, outTok };
}
