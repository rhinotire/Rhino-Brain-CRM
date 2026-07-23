import { db, Prisma } from "@rhino/database";
import { PublicCatalogService } from "./public-catalog-service";
import type { PublicProductDTO } from "./types";

/**
 * Dealer-tier catalog view (read-only portal Phase 1). Wraps the public catalog
 * DTO and adds what an authenticated dealer may see: their tier price and real
 * per-warehouse quantities. Prices resolve tier → priceA fallback because
 * TireGuru "2025 GoodLuck" (the standard dealer price) imports into priceA and
 * per-tier overrides are optional. Cost NEVER leaves this layer.
 */

export type DealerProductDTO = PublicProductDTO & {
  /** the logged-in dealer's price for this SKU (null = ask your rep) */
  dealerPrice: number | null;
  /** total sellable units across warehouses */
  qty: number;
  /** per-warehouse breakdown, keyed by Location.shortTag ("FL", "TX") */
  qtyByLocation: Record<string, number>;
};

const num = (d: Prisma.Decimal | null): number | null => (d === null ? null : Number(d));

type Tier = "A" | "B" | "C" | "D";

export const DealerCatalogService = {
  /** Same search surface as the public catalog, decorated with dealer data. */
  async listPublished(
    params: Parameters<typeof PublicCatalogService.listPublished>[0],
    tier: Tier,
  ): Promise<DealerProductDTO[]> {
    const products = await PublicCatalogService.listPublished(params);
    return this.decorate(products, tier);
  },

  /** Decorate any public DTO list (category page, size page, search results). */
  async decorate(products: PublicProductDTO[], tier: Tier): Promise<DealerProductDTO[]> {
    if (!products.length) return [];
    const rows = await db.product.findMany({
      where: { id: { in: products.map((p) => p.id) } },
      select: {
        id: true,
        priceA: true,
        priceB: true,
        priceC: true,
        priceD: true,
        inventory: { select: { quantity: true, location: { select: { shortTag: true } } } },
      },
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    return products.map((p) => {
      const r = byId.get(p.id);
      const tierPrice = r ? num(r[`price${tier}` as const]) : null;
      const qtyByLocation: Record<string, number> = {};
      let qty = 0;
      for (const inv of r?.inventory ?? []) {
        if (inv.quantity <= 0) continue;
        qtyByLocation[inv.location.shortTag] = (qtyByLocation[inv.location.shortTag] ?? 0) + inv.quantity;
        qty += inv.quantity;
      }
      return { ...p, dealerPrice: tierPrice ?? (r ? num(r.priceA) : null), qty, qtyByLocation };
    });
  },
};
