import { db } from "@rhino/database";

export type SnapshotRow = { sku: string; quantity: number };

export type SnapshotResult =
  | { ok: true; matched: number; unknown: string[] }
  | { ok: false; error: string };

/**
 * Internal inventory logic. Inventory is a per-location snapshot: importing
 * REPLACES the location's stock (docs/initial-audit.md).
 */
export const InventoryService = {
  /**
   * Replace one location's snapshot with the given rows. SKUs in the catalog
   * get the file quantity (0 if not listed); unknown SKUs are reported and
   * skipped. Returns the distinct unknown SKUs.
   */
  async replaceLocationSnapshot(locationId: string, rows: SnapshotRow[]): Promise<SnapshotResult> {
    const loc = await db.location.findUnique({ where: { id: locationId }, select: { id: true } });
    if (!loc) return { ok: false, error: "Location not found." };

    const products = await db.product.findMany({ where: { active: true }, select: { id: true, sku: true } });
    const bySku = new Map(products.map((p) => [p.sku.trim().toLowerCase(), p]));

    const fileQty = new Map<string, number>();
    const unknown: string[] = [];
    for (const r of rows) {
      const key = r.sku.trim().toLowerCase();
      if (!key) continue;
      if (!bySku.has(key)) {
        unknown.push(r.sku.trim());
        continue;
      }
      // keep the highest if a SKU appears twice
      fileQty.set(key, Math.max(fileQty.get(key) ?? 0, Math.max(0, Math.round(r.quantity))));
    }

    // full snapshot for this location: every active product gets file qty, else 0
    const data = products.map((p) => ({
      productId: p.id,
      locationId,
      quantity: fileQty.get(p.sku.trim().toLowerCase()) ?? 0,
    }));

    await db.inventorySnapshot.deleteMany({ where: { locationId } });
    for (let i = 0; i < data.length; i += 500) {
      await db.inventorySnapshot.createMany({ data: data.slice(i, i + 500) });
    }

    return { ok: true, matched: fileQty.size, unknown: [...new Set(unknown)] };
  },

  /** Units on hand per location (products page stat cards). */
  async unitsByLocation(): Promise<{ locationId: string; units: number }[]> {
    const grouped = await db.inventorySnapshot.groupBy({ by: ["locationId"], _sum: { quantity: true } });
    return grouped.map((g) => ({ locationId: g.locationId, units: g._sum.quantity ?? 0 }));
  },
};
