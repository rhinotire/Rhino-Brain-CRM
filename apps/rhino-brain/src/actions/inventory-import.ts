"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireManager } from "@/lib/auth";
import { InventoryService } from "@rhino/services";

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

  const result = await InventoryService.replaceLocationSnapshot(locationId, rows);
  if (!result.ok) return { error: result.error };

  await db.importBatch.create({
    data: { entity: "INVENTORY", fileName, rowCount: rows.length, successful: result.matched, failed: result.unknown.length, userId: session.userId },
  });

  revalidatePath("/products");
  revalidatePath("/settings/import");
  return { ok: true, matched: result.matched, unknown: result.unknown.length, unknownSample: result.unknown.slice(0, 8) };
}
