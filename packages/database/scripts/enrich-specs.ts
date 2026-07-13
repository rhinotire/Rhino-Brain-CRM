/**
 * Spec enrichment — layer 1 (deterministic rules).
 * Fills TireSpec fields from size math + fixed industry tables. Only writes
 * fields that are currently empty; never overwrites existing data.
 *
 *   pnpm exec tsx scripts/enrich-specs.ts --dry   → stats only
 *   pnpm exec tsx scripts/enrich-specs.ts         → apply
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { deriveSpecFromProduct, specGaps } from "../../services/src/spec-rules";

const db = new PrismaClient();
const DRY = process.argv.includes("--dry");
const TIRE_CATS = ["PCR_TIRES", "LT_TIRES", "TBR_TIRES", "TRAILER_TIRES"] as const;

async function main() {
  const products = await db.product.findMany({
    where: { category: { in: [...TIRE_CATS] }, active: true },
    select: { id: true, sku: true, category: true, sizeSpec: true, description: true, rawCategory: true, tireSpec: true },
  });

  const fieldFills: Record<string, number> = {};
  let rowsTouched = 0;
  let fullyGapless = 0;
  const gapCounts: Record<string, number> = {};

  for (const p of products) {
    const ruled = deriveSpecFromProduct(p);
    const existing = (p.tireSpec ?? {}) as Record<string, unknown>;

    // only fields that are empty right now
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(ruled)) {
      if (v === undefined) continue;
      const cur = existing[k];
      if (cur === null || cur === undefined || cur === "") {
        patch[k] = v;
        fieldFills[k] = (fieldFills[k] ?? 0) + 1;
      }
    }

    const gaps = specGaps(existing, ruled);
    if (gaps.length === 0) fullyGapless++;
    for (const g of gaps) gapCounts[g] = (gapCounts[g] ?? 0) + 1;

    if (Object.keys(patch).length > 0) {
      rowsTouched++;
      if (!DRY) {
        // Decimal columns need explicit conversion
        const data = { ...patch } as Record<string, unknown>;
        for (const dec of ["rimDiameter", "sectionWidthIn", "overallDiameterIn", "treadDepth32nds"]) {
          if (typeof data[dec] === "number") data[dec] = new Prisma.Decimal(data[dec] as number);
        }
        await db.tireSpec.upsert({
          where: { productId: p.id },
          update: data,
          create: { productId: p.id, ...data },
        });
      }
    }
  }

  console.log(`${DRY ? "[DRY RUN] " : ""}tire products scanned: ${products.length}`);
  console.log(`spec rows ${DRY ? "that would be " : ""}created/updated: ${rowsTouched}`);
  console.log(`\nfields filled by rules:`);
  Object.entries(fieldFills).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${k.padEnd(20)} ${v}`));
  console.log(`\nproducts with zero remaining core gaps: ${fullyGapless} / ${products.length}`);
  console.log(`remaining gaps (AI layer's worklist):`);
  Object.entries(gapCounts).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${k.padEnd(20)} ${v}`));
}

main().finally(() => db.$disconnect());
