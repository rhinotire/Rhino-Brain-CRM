import { db } from "@rhino/database";
import type { InternalProductHit } from "./types";

export type ProductSearchParams = {
  query?: string;
  rawCategory?: string;
  brand?: string;
  /** Customer whose tier decides the quoted unit price. */
  customerId?: string;
};

/**
 * Internal (rhino-brain) product logic. Callers are responsible for
 * authentication; this layer only implements the data rules.
 */
export const ProductService = {
  /** Distinct raw category labels for filter dropdowns. */
  async listCategories(): Promise<string[]> {
    const rows = await db.product.findMany({
      where: { active: true, rawCategory: { not: null } },
      distinct: ["rawCategory"],
      select: { rawCategory: true },
      orderBy: { rawCategory: "asc" },
    });
    return rows.map((r) => r.rawCategory!).filter(Boolean);
  },

  /** Distinct brands for filter dropdowns. */
  async listBrands(): Promise<string[]> {
    const rows = await db.product.findMany({
      where: { active: true, brand: { not: null } },
      distinct: ["brand"],
      select: { brand: true },
      orderBy: { brand: "asc" },
    });
    return rows.map((r) => r.brand!).filter((b) => b && b.trim());
  },

  /** Managers flag products as discontinued — the flyer auto-pick clears these first. */
  async setDiscontinued(productId: string, value: boolean): Promise<void> {
    await db.product.update({ where: { id: productId }, data: { discontinued: value } });
  },

  /**
   * Publish/unpublish a product on the public website. Publishing fills the
   * public fields it needs: display name (from brand + description + size)
   * and a unique slug. Unpublishing sets INTERNAL and keeps slug/name.
   */
  async setPublished(productId: string, publish: boolean): Promise<{ slug: string | null }> {
    if (!publish) {
      await db.product.update({ where: { id: productId }, data: { visibility: "INTERNAL" } });
      return { slug: null };
    }
    const p = await db.product.findUniqueOrThrow({
      where: { id: productId },
      select: { sku: true, brand: true, description: true, sizeSpec: true, slug: true, name: true },
    });
    const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const name = p.name ?? [p.brand, p.description, p.sizeSpec].filter(Boolean).join(" ").trim();
    let slug = p.slug ?? slugify(name || p.sku);
    const clash = await db.product.findFirst({ where: { slug, NOT: { id: productId } }, select: { id: true } });
    if (clash) slug = `${slug}-${slugify(p.sku)}`;
    await db.product.update({ where: { id: productId }, data: { visibility: "PUBLIC", slug, name: name || p.sku } });
    return { slug };
  },

  /**
   * Live product search — matches size/SKU/brand/description, optionally scoped
   * to a category. With a category or brand set, an empty query lists that set.
   */
  async search({ query = "", rawCategory, brand, customerId }: ProductSearchParams): Promise<InternalProductHit[]> {
    const q = query.trim();
    const cat = rawCategory?.trim();
    const br = brand?.trim();
    if (q.length < 2 && !cat && !br) return []; // need text, a category, or a brand

    const tier = customerId
      ? (await db.customer.findUnique({ where: { id: customerId }, select: { tier: true } }))?.tier ?? null
      : null;

    const products = await db.product.findMany({
      where: {
        active: true,
        ...(cat ? { rawCategory: cat } : {}),
        ...(br ? { brand: br } : {}),
        ...(q.length >= 2
          ? {
              OR: [
                { sizeSpec: { contains: q, mode: "insensitive" } },
                { sku: { contains: q, mode: "insensitive" } },
                { brand: { contains: q, mode: "insensitive" } },
                { description: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: [{ sizeSpec: "asc" }, { sku: "asc" }],
      take: (cat || br) && q.length < 2 ? 40 : 12,
      include: { inventory: { include: { location: { select: { shortTag: true } } } } },
    });

    return products.map((p) => {
      const priceRaw =
        tier === "A" ? p.priceA : tier === "B" ? p.priceB : tier === "C" ? p.priceC : tier === "D" ? p.priceD : null;
      return {
        id: p.id,
        sku: p.sku,
        brand: p.brand,
        category: p.category,
        rawCategory: p.rawCategory,
        sizeSpec: p.sizeSpec,
        description: p.description,
        imagePath: p.imagePath,
        tierPrice: priceRaw !== null && priceRaw !== undefined ? Number(priceRaw) : null,
        stock: p.inventory.map((i) => ({ tag: i.location.shortTag, qty: i.quantity })),
      };
    });
  },
};
