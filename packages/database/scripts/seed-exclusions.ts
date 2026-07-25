// packages/database/scripts/seed-exclusions.ts
/**
 * Protection-pool init (spec §3.2, §7 D-pool):
 *  1. every existing Customer (kind=EXISTING_CUSTOMER)
 *  2. named competitors / supply-chain giants from the market analysis
 * Idempotent — re-running skips existing companyName+kind rows.
 *
 *   pnpm --filter @rhino/database exec tsx scripts/seed-exclusions.ts
 */
import { PrismaClient } from "@prisma/client";
import { domainKey, phoneKey } from "../../services/src/referral-matching";

const db = new PrismaClient();

const COMPETITORS: Array<{ name: string; website?: string }> = [
  { name: "Tredit Tire & Wheel", website: "tredit.com" },
  { name: "Lionshead Tire & Wheel", website: "lionsheadtireandwheel.com" },
  { name: "Taskmaster Components", website: "taskmastercomponents.com" },
  { name: "Martin Wheel", website: "martinwheel.com" },
  { name: "Dexter Axle", website: "dexteraxle.com" },
  { name: "TexTrail Trailer Parts", website: "textrail.com" },
  { name: "Redneck Trailer Supplies", website: "redneck-trailer.com" },
];

async function main() {
  const existing = new Set(
    (await db.exclusionList.findMany({ select: { companyName: true, kind: true } })).map(
      (r) => `${r.kind}:${r.companyName.toLowerCase()}`
    )
  );
  let added = 0;

  for (const c of COMPETITORS) {
    if (existing.has(`COMPETITOR:${c.name.toLowerCase()}`)) continue;
    await db.exclusionList.create({
      data: { kind: "COMPETITOR", companyName: c.name, domain: domainKey(c.website) || null, reason: "market analysis 2026-07-24" },
    });
    added++;
  }

  const customers = await db.customer.findMany({
    select: { companyName: true, phone: true, contactCell: true, website: true },
  });
  for (const c of customers) {
    if (!c.companyName || existing.has(`EXISTING_CUSTOMER:${c.companyName.toLowerCase()}`)) continue;
    existing.add(`EXISTING_CUSTOMER:${c.companyName.toLowerCase()}`);
    await db.exclusionList.create({
      data: {
        kind: "EXISTING_CUSTOMER",
        companyName: c.companyName,
        domain: domainKey(c.website) || null,
        phone: phoneKey(c.phone) || phoneKey(c.contactCell) || null,
        reason: "auto-import from Customer table",
      },
    });
    added++;
  }
  console.log(`exclusions added: ${added}, total now: ${await db.exclusionList.count()}`);
}

main().finally(() => db.$disconnect());
