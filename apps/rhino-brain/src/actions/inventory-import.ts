"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireManager } from "@/lib/auth";

export type InvRow = { sku: string; quantity: number };

/**
 * Inventory is a per-location snapshot. Uploading REPLACES the chosen location's
 * stock with the file: SKUs in the catalog get the file quantity (0 if not listed),
 * unknown SKUs are reported and skipped.
 */
export async function importInventory(fileName: string, locationId: string, rows: InvRow[]): Promise<{ ok?: boolean; matched?: number; unknown?: number; unknownSample?: string[]; error?: string }> {
  const session = await requireManager();
  if (!locationId) return { error: "Pick which warehouse this file is for." };
  if (rows.length === 0) return { error: "No stock rows found in the file." };
  if (rows.length > 20000) return { error: "Too many rows (max 20000)." };

  const loc = await db.location.findUnique({ where: { id: locationId }, select: { id: true } });
  if (!loc) return { error: "Location not found." };

  const products = await db.product.findMany({ where: { active: true }, select: { id: true, sku: true } });
  const bySku = new Map(products.map(p => [p.sku.trim().toLowerCase(), p]));

  const fileQty = new Map<string, number>();
  const unknown: string[] = [];
  for (const r of rows) {
    const key = r.sku.trim().toLowerCase();
    if (!key) continue;
    if (!bySku.has(key)) { unknown.push(r.sku.trim()); continue; }
    // keep the highest if a SKU appears twice
    fileQty.set(key, Math.max(fileQty.get(key) ?? 0, Math.max(0, Math.round(r.quantity))));
  }

  // full snapshot for this location: every active product gets file qty, else 0
  const data = products.map(p => ({
    productId: p.id,
    locationId,
    quantity: fileQty.get(p.sku.trim().toLowerCase()) ?? 0,
  }));

  await db.inventorySnapshot.deleteMany({ where: { locationId } });
  for (let i = 0; i < data.length; i += 500) {
    await db.inventorySnapshot.createMany({ data: data.slice(i, i + 500) });
  }

  await db.importBatch.create({
    data: { entity: "INVENTORY", fileName, rowCount: rows.length, successful: fileQty.size, failed: unknown.length, userId: session.userId },
  });

  revalidatePath("/products");
  revalidatePath("/settings/import");
  return { ok: true, matched: fileQty.size, unknown: unknown.length, unknownSample: [...new Set(unknown)].slice(0, 8) };
}
