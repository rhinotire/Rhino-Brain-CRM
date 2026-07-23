/**
 * TireGuru → CRM sync. Replaces William's manual, partial re-keying of TireGuru
 * exports with a full-alignment import (docs/competitor-benchmark-b2b-portals.md,
 * "Data path B"). TireGuru POS stays the source of truth; this makes the CRM an
 * accurate mirror so the read-only dealer portal can trust it.
 *
 * Input: the two reports William already exports from TireGuru Business Center:
 *   - Stock Status report  (sheet "StockStatus")        — per-location quantities
 *   - Price Level report   (sheet "MultipleLevel-Pricing") — tier prices, FET
 *
 * Run from apps/rhino-brain (where tsx + @prisma/client resolve):
 *   npx tsx ../../import-tireguru.ts --stock <stock.xlsx> --price <price.xlsx> --location FL
 *   Add --apply to write. Without it: dry run, prints the diff and touches nothing.
 *
 * Safety: never deletes products. Missing-from-report SKUs get quantity 0 at the
 * imported location only. New products default to visibility INTERNAL (never
 * auto-published — brand-safety §13).
 */
import { PrismaClient, Prisma, ProductCategory } from "@prisma/client";
import * as XLSX from "xlsx";

// ---------------------------------------------------------------------------
// Price-level mapping — CONFIRM WITH WILLIAM before first --apply.
// TireGuru level name → CRM field. Unknown levels are reported and skipped.
// Sample values 2026-07-23 (CROSSWIND M/T 33X12.50R15): C-5 114.80 < Wholesale
// 151.41 < 2025 GoodLuck 155.95 < GoodLuck CC 160.77 < Retail Markup 222.79.
// ---------------------------------------------------------------------------
const PRICE_LEVEL_MAP: Record<string, "priceA" | "priceB" | "priceC" | "priceD" | "msrp"> = {
  "C-5": "priceA",
  "Wholesale": "priceB",
  "2025 GoodLuck": "priceC",
  "2025 Goodluck CC": "priceD",
  "Retail Markup": "msrp",
};

type StockRow = {
  sku: string;
  size: string | null;
  description: string;
  brand: string | null;
  itemType: "TIRE" | "WHEEL" | "PART";
  onHand: number;
  committed: number;
  onOrder: number;
  avgCost: number | null;
};

type PriceRow = {
  sku: string;
  brand: string | null;
  size: string | null;
  description: string | null;
  levels: Record<string, number>;
};

const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const APPLY = args.includes("--apply");
const STOCKED_ONLY = args.includes("--stocked-only"); // skip price-report items with zero stock
const stockPath = arg("stock");
const pricePath = arg("price");
const locationTag = arg("location");
if (!stockPath || !locationTag) {
  console.error("Usage: tsx import-tireguru.ts --stock <xlsx> [--price <xlsx>] --location FL [--apply] [--stocked-only]");
  process.exit(1);
}

const sheetRows = (path: string): unknown[][] => {
  const wb = XLSX.readFile(path);
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null }) as unknown[][];
};
const cellStr = (v: unknown): string | null => (v === null || v === undefined ? null : String(v).trim() || null);
const isTotalRow = (row: unknown[]) => row.some((c) => typeof c === "string" && c.toUpperCase().includes("TOTAL"));

function parseStock(path: string): StockRow[] {
  const rows = sheetRows(path);
  const headerIdx = rows.findIndex((r) => r[0] === "Item" && r.includes("On Hand"));
  if (headerIdx < 0) throw new Error("Stock report: header row (Item / On Hand) not found — is this the Stock Status report?");

  const out: StockRow[] = [];
  let brand: string | null = null;
  let itemType: StockRow["itemType"] = "TIRE";
  for (const row of rows.slice(headerIdx + 1)) {
    const first = row[0];
    if (typeof first === "string" && first.startsWith(">>> ITEM TYPE")) {
      itemType = (cellStr(row[1])?.toUpperCase() as StockRow["itemType"]) ?? "TIRE";
      continue;
    }
    if (isTotalRow(row)) continue;
    const restEmpty = row.slice(1).every((c) => c === null);
    if (typeof first === "string" && restEmpty) {
      // section heading: manufacturer ("-CROSSWIND-") vs indented group (" M/T TIRE")
      if (!first.startsWith(" ")) brand = first.replace(/^-+|-+$/g, "").trim() || brand;
      continue;
    }
    // data row: Item + Description + numeric On Hand
    if (first === null || row[2] === null || typeof row[3] !== "number") continue;
    out.push({
      sku: String(first).trim(),
      size: cellStr(row[1]),
      description: String(row[2]).trim(),
      brand,
      itemType,
      onHand: row[3],
      avgCost: typeof row[5] === "number" ? row[5] : null,
      committed: Number(row[8]) || 0,
      onOrder: Number(row[9]) || 0,
    });
  }
  return out;
}

function parsePrice(path: string): { rows: PriceRow[]; levelNames: string[] } {
  const rows = sheetRows(path);
  const headerIdx = rows.findIndex((r) => r[0] === "Mfg" && r[3] === "Item");
  if (headerIdx < 0) throw new Error("Price report: header row (Mfg / Item) not found — is this the Price Level report?");
  const header = rows[headerIdx].map((c) => cellStr(c));
  const fetIdx = header.indexOf("FET");
  const levelCols: { idx: number; name: string }[] = [];
  for (let i = 6; i < (fetIdx < 0 ? header.length : fetIdx); i++) {
    if (header[i]) levelCols.push({ idx: i, name: header[i]! });
  }

  const out: PriceRow[] = [];
  for (const row of rows.slice(headerIdx + 1)) {
    if (row[3] === null || isTotalRow(row)) continue;
    const levels: Record<string, number> = {};
    for (const { idx, name } of levelCols) if (typeof row[idx] === "number") levels[name] = row[idx] as number;
    out.push({
      sku: String(row[3]).trim(),
      brand: cellStr(row[0])?.replace(/^-+|-+$/g, "").trim() ?? null,
      size: cellStr(row[4]),
      description: cellStr(row[5]),
      levels,
    });
  }
  return { rows: out, levelNames: levelCols.map((l) => l.name) };
}

/** Category guess for NEW products only (existing categories are never overwritten). */
function guessCategory(r: { itemType: string; size: string | null; description: string }): ProductCategory {
  if (r.itemType === "WHEEL") return "WHEELS";
  if (r.itemType === "PART") return "OTHER";
  const size = (r.size ?? "").toUpperCase();
  if (size.startsWith("ST")) return "TRAILER_TIRES";
  if (/R(17\.5|19\.5|22\.5|24\.5)/.test(size) || /^\d{1,2}(\.\d)?R\d/.test(size)) return "TBR_TIRES";
  if (size.startsWith("LT") || /\d{2}[X*/]\d{1,2}\.?\d*R/.test(size)) return "LT_TIRES";
  return "PCR_TIRES";
}

/** "T221005267" / "CROS211005711" → "221005267" (price report prefixes SKUs). */
const stripAlphaPrefix = (sku: string) => sku.replace(/^[A-Z]+[-]?/i, "");

async function main() {
  const db = new PrismaClient();
  const location = await db.location.findFirst({ where: { shortTag: locationTag } });
  if (!location) {
    const all = await db.location.findMany();
    throw new Error(`Location tag "${locationTag}" not found. Available: ${all.map((l) => `${l.shortTag} (${l.name})`).join(", ")}`);
  }

  const stock = parseStock(stockPath!);
  const price = pricePath ? parsePrice(pricePath) : { rows: [] as PriceRow[], levelNames: [] as string[] };

  // join price rows to stock SKUs (exact, then alpha-prefix-stripped)
  const priceBySku = new Map(price.rows.map((r) => [r.sku, r]));
  const priceByStripped = new Map(price.rows.map((r) => [stripAlphaPrefix(r.sku), r]));
  const priceFor = (sku: string) => priceBySku.get(sku) ?? priceByStripped.get(sku);

  const unknownLevels = price.levelNames.filter((n) => !PRICE_LEVEL_MAP[n]);
  const existing = await db.product.findMany({
    select: { id: true, sku: true, cost: true, priceA: true, priceB: true, priceC: true, priceD: true, msrp: true },
  });
  const existingBySku = new Map(existing.map((p) => [p.sku, p]));

  // union of stock SKUs + price-only SKUs (price report includes zero-stock items)
  const stockSkus = new Set(stock.map((r) => r.sku));
  const priceOnly = STOCKED_ONLY
    ? []
    : price.rows.filter((r) => !stockSkus.has(r.sku) && !existingBySku.has(r.sku) && !stockSkus.has(stripAlphaPrefix(r.sku)));

  const newFromStock = stock.filter((r) => !existingBySku.has(r.sku));
  const matchedPrices = stock.filter((r) => priceFor(r.sku)).length;

  console.log(`\n=== TireGuru import ${APPLY ? "(APPLY)" : "(dry run)"} — location ${location.name} [${location.shortTag}] ===`);
  console.log(`Stock report rows parsed:   ${stock.length} (types: ${JSON.stringify(Object.fromEntries(["TIRE", "WHEEL", "PART"].map((t) => [t, stock.filter((r) => r.itemType === t).length])))})`);
  console.log(`Price report rows parsed:   ${price.rows.length}; levels: ${price.levelNames.join(" | ") || "—"}`);
  if (unknownLevels.length) console.log(`!! Unmapped price levels (SKIPPED): ${unknownLevels.join(", ")} — extend PRICE_LEVEL_MAP`);
  console.log(`Stock SKUs with price match: ${matchedPrices}/${stock.length}`);
  console.log(`Products already in CRM:    ${existing.length}`);
  console.log(`NEW products from stock:    ${newFromStock.length}`);
  console.log(`NEW products price-only:    ${priceOnly.length} (in price report, zero stock, not in CRM)`);
  console.log(`Sample new SKUs: ${newFromStock.slice(0, 10).map((r) => `${r.sku} ${r.size ?? ""}`).join(" · ")}`);

  const priceData = (p: PriceRow | undefined) => {
    const d: Record<string, number> = {};
    if (!p) return d;
    for (const [level, field] of Object.entries(PRICE_LEVEL_MAP)) {
      if (p.levels[level] !== undefined) d[field] = p.levels[level];
    }
    return d;
  };

  if (!APPLY) {
    console.log("\nDry run only — re-run with --apply to write.");
    await db.$disconnect();
    return;
  }

  let created = 0, updated = 0, snapshots = 0;
  for (const r of stock) {
    const p = priceFor(r.sku);
    const base = {
      brand: r.brand ?? p?.brand ?? undefined,
      sizeSpec: r.size ?? undefined,
      cost: r.avgCost ?? undefined,
      ...priceData(p),
    };
    const found = existingBySku.get(r.sku);
    const product = found
      ? await db.product.update({ where: { id: found.id }, data: base })
      : await db.product.create({
          data: { sku: r.sku, description: r.description, category: guessCategory(r), ...base },
        });
    if (found) updated++; else created++;
    await db.inventorySnapshot.upsert({
      where: { productId_locationId: { productId: product.id, locationId: location.id } },
      create: { productId: product.id, locationId: location.id, quantity: r.onHand, reservedQty: r.committed, incomingQty: r.onOrder },
      update: { quantity: r.onHand, reservedQty: r.committed, incomingQty: r.onOrder, snapshotAt: new Date() },
    });
    snapshots++;
    if ((created + updated) % 250 === 0) console.log(`  ...${created + updated}/${stock.length}`);
  }

  for (const p of priceOnly) {
    await db.product.create({
      data: {
        sku: p.sku,
        description: p.description ?? p.size ?? p.sku,
        brand: p.brand ?? undefined,
        sizeSpec: p.size ?? undefined,
        category: guessCategory({ itemType: "TIRE", size: p.size, description: p.description ?? "" }),
        ...priceData(p),
      },
    });
    created++;
  }

  // zero out this location's snapshots for SKUs absent from a full report
  const zeroed = await db.inventorySnapshot.updateMany({
    where: { locationId: location.id, quantity: { gt: 0 }, product: { sku: { notIn: [...stockSkus] } } },
    data: { quantity: 0, snapshotAt: new Date() },
  });

  console.log(`\nDone. Created ${created}, updated ${updated}, snapshots ${snapshots}, zeroed ${zeroed.count} stale snapshots at ${location.shortTag}.`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
