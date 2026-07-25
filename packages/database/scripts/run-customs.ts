// packages/database/scripts/run-customs.ts
/**
 * Customs-data prospecting via ImportGenius (spec Phase 2 CUSTOMS source):
 * search bills of lading → aggregate consignees (importers) → exclusion/dedupe
 * → six-check score with shipment evidence → Lead rows awaiting calibration.
 *
 *   pnpm --filter @rhino/database exec tsx scripts/run-customs.ts --field product --term "pneumatic tire" --pages 3
 *   pnpm --filter @rhino/database exec tsx scripts/run-customs.ts --field shipname --term "qingdao" --pages 5
 *   --country us (ImportGenius country code) --dry (no AI, no writes)
 *
 * Each page = 1 API query = credits; --pages caps spend (10 rows/page).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { db } from "../src";
import { searchShipmentsPage, aggregateConsignees, type CustomsSearchField, type CustomsShipmentRow } from "../../services/src/customs-collector";
import { dedupeKeyFor } from "../../services/src/prospect-dedupe";
import { matchesExclusion } from "../../services/src/exclusion-service";
import { scoreProspect, assignStateLocation } from "../../services/src/prospect-score";
import type { Enrichment } from "../../services/src/prospect-enrich";

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
}
function ensureEnv(name: string) {
  if (process.env[name]) return;
  try {
    const env = readFileSync(join(__dirname, "..", ".env"), "utf8");
    const m = env.match(new RegExp(`^${name}="?([^"\\n]+)"?`, "m"));
    if (m) process.env[name] = m[1];
  } catch { /* explicit check below */ }
}

async function main() {
  const FIELD = (arg("field", "product") ?? "product") as CustomsSearchField;
  const TERM = arg("term");
  const COUNTRY = (arg("country", "us") ?? "us").toLowerCase();
  const PAGES = Math.max(1, Math.min(20, Number(arg("pages", "3"))));
  const DRY = process.argv.includes("--dry");
  if (!TERM) throw new Error('--term is required, e.g. --term "pneumatic tire"');
  ensureEnv("IMPORTGENIUS_ACCESS_TOKEN");
  ensureEnv("ANTHROPIC_API_KEY");
  const token = process.env.IMPORTGENIUS_ACCESS_TOKEN;
  if (!token) throw new Error("IMPORTGENIUS_ACCESS_TOKEN not set");
  if (!DRY && !process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not set");

  // 1. Pull shipment pages (each page costs credits)
  const rows: CustomsShipmentRow[] = [];
  let total = 0, balance: number | null = null;
  for (let page = 1; page <= PAGES; page++) {
    const r = await searchShipmentsPage({ field: FIELD, term: TERM, country: COUNTRY, page, accessToken: token });
    rows.push(...r.rows);
    total = r.total;
    balance = r.balance;
    if (r.rows.length < 10) break;
  }
  const aggs = aggregateConsignees(rows);
  console.log(`shipments matched: ${total}; pulled ${rows.length} rows -> ${aggs.length} unique importers; IG balance: ${balance ?? "?"}`);

  const exclusions = await db.exclusionList.findMany({ select: { kind: true, companyName: true, domain: true, phone: true } });
  const locByTag = async (tag: string) => (await db.location.findFirst({ where: { shortTag: tag } }))?.id ?? null;
  const rhinoId = await locByTag("FL");
  const everflowId = await locByTag("TX");
  const qingdaoId = await locByTag("QD");

  let created = 0, dups = 0, excluded = 0, skipped = 0, inTok = 0, outTok = 0;
  const run = DRY ? null : await db.sourceRun.create({
    data: { source: "CUSTOMS", params: { field: FIELD, term: TERM, country: COUNTRY, pages: PAGES, shipmentsMatched: total } },
  });

  try {
    for (const a of aggs) {
      if (matchesExclusion({ companyName: a.consignee }, exclusions)) { excluded++; continue; }
      const key = dedupeKeyFor({ companyName: a.consignee, city: a.city });
      if (!key) { skipped++; continue; }
      if (await db.lead.findFirst({ where: { dedupeKey: key }, select: { id: true } })) { dups++; continue; }
      if (DRY) { console.log(`would create: ${a.consignee} (${a.shipmentCount} shipments; via ${a.shippers[0] ?? "?"})`); continue; }

      try {
        // Customs evidence IS the enrichment — hard purchasing proof.
        const enrichment: Enrichment = {
          emails: [],
          brandsSold: [],
          sellsWholesale: null,
          businessSummary: `US customs records: ${a.shipmentCount} tire-related import shipment(s) matched "${TERM}". Suppliers: ${a.shippers.join("; ") || "n/a"}. Sample products: ${a.sampleProducts.join(" | ") || "n/a"}.`,
          buyerSignals: [
            `importer of record on ${a.shipmentCount} bill(s) of lading`,
            ...(a.shippers.length ? [`buys from: ${a.shippers.join(", ")}`] : []),
          ],
        };
        const sc = await scoreProspect({ companyName: a.consignee, state: a.state, enrichment });
        inTok += sc.inputTokens; outTok += sc.outputTokens;
        const wh = COUNTRY === "us" ? assignStateLocation(a.state) : null;
        await db.lead.create({
          data: {
            companyName: a.consignee,
            city: a.city, state: a.state,
            type: "WHOLESALE_DEALER",
            source: "PROSPECTING",
            interest: sc.verdict.productLine === "P3_PCR" ? "PCR_TIRES" : sc.verdict.productLine === "P4_TBR" ? "TBR_TIRES" : sc.verdict.productLine === "P2_TRAILER_WHEEL" ? "WHEELS" : "TRAILER_TIRES",
            stage: "NEW_LEAD",
            pool: sc.verdict.pool, confidence: sc.verdict.confidence, productLine: sc.verdict.productLine,
            score: sc.verdict.score, scoreReasons: sc.verdict.checks,
            enrichment: enrichment as object,
            dedupeKey: key, sourceRunId: run!.id,
            country: COUNTRY.toUpperCase(),
            locationId: COUNTRY !== "us" ? qingdaoId : wh === "RHINO" ? rhinoId : wh === "EVERFLOW" ? everflowId : null,
            meta: { customsTerm: TERM, shipmentCount: a.shipmentCount, shippers: a.shippers, sampleProducts: a.sampleProducts },
          },
        });
        created++;
        console.log(`+ ${a.consignee} [${sc.verdict.pool}/${sc.verdict.confidence}] score=${sc.verdict.score} (${a.shipmentCount} shipments)`);
      } catch (e) {
        skipped++;
        console.warn(`! skipped ${a.consignee}: ${e instanceof Error ? e.message : e}`);
      }
    }
  } finally {
    if (run) {
      await db.sourceRun.update({
        where: { id: run.id },
        data: { resultCount: aggs.length, newLeadCount: created, dupCount: dups, excludedCount: excluded, inputTokens: inTok, outputTokens: outTok },
      });
    }
    console.log({ importers: aggs.length, created, dups, excluded, skipped, igBalance: balance });
  }
}

main().finally(() => db.$disconnect());
