// packages/database/scripts/seed-prospect-leads.ts
/**
 * Seed the ~30 named target companies from the 2026-07-24 market analysis
 * (spec §7). Grades preset; humans re-verify in the calibration queue.
 * Idempotent via Lead.dedupeKey.
 *
 *   pnpm --filter @rhino/database exec tsx scripts/seed-prospect-leads.ts
 */
import { PrismaClient, type ProspectPool, type ProspectConfidence, type ProspectProductLine } from "@prisma/client";
import { dedupeKeyFor } from "../../services/src/prospect-dedupe";
import { matchesExclusion } from "../../services/src/exclusion-service";

const db = new PrismaClient();

type Seed = {
  name: string; website: string; state?: string;
  pool: ProspectPool; confidence: ProspectConfidence; line: ProspectProductLine;
  angle: string;
};

// P4/P5 commercial line first — owner priority 2026-07-24.
const SEEDS: Seed[] = [
  { name: "Purcell Tire & Service", website: "purcelltire.com", pool: "A_BUYER", confidence: "H", line: "P4_TBR", angle: "71 locations, commercial/OTR/ag + distribution. Pitch second-source supply for one chosen duty cycle + cost model. Do NOT lead with price alone." },
  { name: "McCarthy Tire Service", website: "mccarthytire.com", pool: "A_BUYER", confidence: "H", line: "P4_TBR", angle: "East-coast commercial/fleet/OTR group, 75+ locations. Pick one duty cycle/size, pitch supply stability + cost-per-mile. Needs warranty story." },
  { name: "Parrish Tire Wholesale", website: "parrishtire.com", pool: "A_BUYER", confidence: "H", line: "P3_PCR", angle: "Multi-state wholesale DCs, PCR/TBR/ag, open to private label. Find price-band/size gaps; offer regional protection + stock support." },
  { name: "K&M Tire", website: "kmtire.com", state: "OH", pool: "A_BUYER", confidence: "M", line: "P3_PCR", angle: "Wholesale dealer program exists; verify warehouse network + category fit before touching." },
  { name: "The Trailer Parts Outlet", website: "thetrailerpartsoutlet.com", state: "TX", pool: "A_BUYER", confidence: "H", line: "P1_TRAILER_TIRE", angle: "Sells 13–17.5\" ST tires + preassembled tire/wheel by the pallet. Pitch fill-in load ranges, assembly specs, steady lead time. Verify AD/CVD exposure first — never quote a duty rate." },
  { name: "Southwest Wheel", website: "southwestwheel.com", state: "TX", pool: "A_BUYER", confidence: "H", line: "P2_TRAILER_WHEEL", angle: "Full trailer parts line (axles, brakes, wheels, jacks, couplers, Dexter). Pitch ST assembly + wheel + jack/coupler supplement matrix, not a full catalog." },
  { name: "Eastern Marine / Trailer Parts Superstore", website: "easternmarine.com", state: "DE", pool: "A_BUYER", confidence: "H", line: "P1_TRAILER_TIRE", angle: "Boat/RV/utility trailer parts since 1981. Pitch size + corrosion-resistant wheel matrix by scenario; US stock replenishment." },
  { name: "RecStuff", website: "recstuff.com", state: "WI", pool: "A_BUYER", confidence: "H", line: "P1_TRAILER_TIRE", angle: "Tire/wheel/assembly by trailer type, wholesale inquiry page, 8–18\". One-page catalog-gap list, not the full lineup." },
  { name: "etrailer", website: "etrailer.com", state: "MO", pool: "A_BUYER", confidence: "H", line: "P1_TRAILER_TIRE", angle: "Big vertical e-commerce, tests products. Offer a specific testable SKU + DOT/quality/packaging/content pack. Project-style, high bar." },
  { name: "Big Tex Trailer World", website: "bigtextrailerworld.com", state: "TX", pool: "A_BUYER", confidence: "M", line: "P1_TRAILER_TIRE", angle: "Multi-state dealer/service network, 4000+ parts. Verify central purchasing + existing supply deals first." },
  { name: "Sturdy Built Trailer Parts", website: "sturdybuiltonline.com", pool: "A_BUYER", confidence: "M", line: "P1_TRAILER_TIRE", angle: "Mid-size vertical channel, short decision chain — good early sample customer. Verify import capability." },
  { name: "Leonard Truck Outfitters", website: "leonardusa.com", pool: "A_BUYER", confidence: "M", line: "P1_TRAILER_TIRE", angle: "Trailer + truck accessories + service, multiple locations. Verify purchasing centralization." },
  // B pool — OEM / big retail. First-touch email OK (needs-discovery only); no credential claims until DOT/warranty pack ready (spec §8.6).
  { name: "Big Tex Trailers", website: "bigtextrailers.com", state: "TX", pool: "B_PROJECT", confidence: "H", line: "P1_TRAILER_TIRE", angle: "Major trailer OEM. Entry via specific SKU cost/delivery or aftermarket parts." },
  { name: "PJ Trailers", website: "pjtrailers.com", state: "TX", pool: "B_PROJECT", confidence: "H", line: "P1_TRAILER_TIRE", angle: "Pro-grade trailer OEM; long supplier-approval cycle." },
  { name: "Carry-On Trailer", website: "carry-ontrailer.com", pool: "B_PROJECT", confidence: "H", line: "P1_TRAILER_TIRE", angle: "Volume utility/cargo OEM; confirm group supplier process." },
  { name: "Diamond C Trailers", website: "diamondc.com", state: "TX", pool: "B_PROJECT", confidence: "M", line: "P1_TRAILER_TIRE", angle: "Heavy-duty/gooseneck; high quality bar — 17.5\" assemblies." },
  { name: "Load Trail", website: "loadtrail.com", state: "TX", pool: "B_PROJECT", confidence: "M", line: "P1_TRAILER_TIRE", angle: "OEM + dealer network; start with supplier registration." },
  { name: "Aluma Trailers", website: "alumaklm.com", pool: "B_PROJECT", confidence: "M", line: "P2_TRAILER_WHEEL", angle: "Aluminum trailers — aluminum wheels, corrosion/finish evidence needed." },
  { name: "Tractor Supply", website: "tractorsupply.com", pool: "B_PROJECT", confidence: "M", line: "P1_TRAILER_TIRE", angle: "National farm retail. Phase-3 target: vendor onboarding/EDI heavy — do not auto-touch." },
  { name: "Tire Rack", website: "tirerack.com", pool: "B_PROJECT", confidence: "M", line: "P3_PCR", angle: "Phase-3: differentiated brand/exclusive-spec validation only." },
  // C pool — channel, verify before anything.
  { name: "TrailerTires.com", website: "trailertires.com", pool: "C_CHANNEL", confidence: "H", line: "P1_TRAILER_TIRE", angle: "Vertical e-commerce; may be Eastern Marine-affiliated — dedupe entity first." },
  { name: "Trailer Parts Depot", website: "trailerpartsdepot.com", pool: "C_CHANNEL", confidence: "M", line: "P1_TRAILER_TIRE", angle: "Verify scale + import capability." },
  { name: "Champion Trailers", website: "championtrailers.com", pool: "C_CHANNEL", confidence: "M", line: "P1_TRAILER_TIRE", angle: "Kits/parts/repair; central purchasing unverified." },
  { name: "Six Robblees", website: "sixrobblees.com", state: "WA", pool: "C_CHANNEL", confidence: "M", line: "P4_TBR", angle: "NW truck/trailer parts distributor; verify tire/wheel purchasing authority." },
  { name: "National Trailer Source", website: "nationaltrailersource.com", pool: "C_CHANNEL", confidence: "M", line: "P1_TRAILER_TIRE", angle: "Multi-store dealer; confirm central purchasing + brand strategy." },
  { name: "Northern Tool + Equipment", website: "northerntool.com", pool: "C_CHANNEL", confidence: "M", line: "P1_TRAILER_TIRE", angle: "Closer to B pool; hold in manual pool until vendor path known." },
  { name: "FleetPride", website: "fleetpride.com", state: "TX", pool: "C_CHANNEL", confidence: "M", line: "P4_TBR", angle: "Heavy-duty aftermarket network; wheels/trailer parts overlap, verify tire purchasing scope." },
  { name: "RNR Tire Express", website: "rnrtires.com", state: "FL", pool: "C_CHANNEL", confidence: "L", line: "P3_PCR", angle: "Franchise retail; central purchasing/import logic unclear." },
];

async function main() {
  const exclusions = await db.exclusionList.findMany({
    select: { kind: true, companyName: true, domain: true, phone: true },
  });
  const run = await db.sourceRun.create({
    data: { source: "SEED", params: { doc: "spec §7 seed list", count: SEEDS.length } },
  });
  let created = 0, dups = 0, excluded = 0;

  for (const s of SEEDS) {
    if (matchesExclusion({ companyName: s.name, website: s.website }, exclusions)) { excluded++; continue; }
    const key = dedupeKeyFor({ website: s.website, companyName: s.name });
    if (!key) continue;
    const dup = await db.lead.findFirst({ where: { dedupeKey: key }, select: { id: true } });
    if (dup) { dups++; continue; }
    await db.lead.create({
      data: {
        companyName: s.name,
        state: s.state ?? null,
        type: s.line.startsWith("P1") || s.line.startsWith("P2") ? "TRAILER_MANUFACTURER" : "WHOLESALE_DEALER",
        source: "PROSPECTING",
        interest: s.line === "P4_TBR" ? "TBR_TIRES" : s.line === "P3_PCR" ? "PCR_TIRES" : s.line === "P2_TRAILER_WHEEL" ? "WHEELS" : "TRAILER_TIRES",
        stage: "NEW_LEAD",
        pool: s.pool,
        confidence: s.confidence,
        productLine: s.line,
        dedupeKey: key,
        sourceRunId: run.id,
        notes: `Seed from market analysis 2026-07-24.`,
        meta: { website: s.website, angle: s.angle },
      },
    });
    created++;
  }
  await db.sourceRun.update({
    where: { id: run.id },
    data: { resultCount: SEEDS.length, newLeadCount: created, dupCount: dups, excludedCount: excluded },
  });
  console.log({ created, dups, excluded });
}

main().finally(() => db.$disconnect());
