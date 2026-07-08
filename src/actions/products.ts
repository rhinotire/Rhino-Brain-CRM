"use server";

import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";

export type ProductHit = {
  id: string;
  sku: string;
  brand: string | null;
  category: string;
  rawCategory: string | null;
  sizeSpec: string | null;
  description: string;
  tierPrice: number | null; // price for the quote customer's tier, when set on the product
  stock: { tag: string; qty: number }[];
};

/** Live product search for the quote form — matches size/SKU/brand/description. */
export async function searchProducts(query: string, customerId?: string): Promise<ProductHit[]> {
  await requireSession();
  const q = query.trim();
  if (q.length < 2) return [];

  const tier = customerId
    ? (await db.customer.findUnique({ where: { id: customerId }, select: { tier: true } }))?.tier ?? null
    : null;

  const products = await db.product.findMany({
    where: {
      active: true,
      OR: [
        { sizeSpec: { contains: q, mode: "insensitive" } },
        { sku: { contains: q, mode: "insensitive" } },
        { brand: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
      ],
    },
    orderBy: [{ sizeSpec: "asc" }, { sku: "asc" }],
    take: 12,
    include: { inventory: { include: { location: { select: { shortTag: true } } } } },
  });

  return products.map(p => {
    const priceRaw = tier === "A" ? p.priceA : tier === "B" ? p.priceB : tier === "C" ? p.priceC : tier === "D" ? p.priceD : null;
    return {
      id: p.id,
      sku: p.sku,
      brand: p.brand,
      category: p.category,
      rawCategory: p.rawCategory,
      sizeSpec: p.sizeSpec,
      description: p.description,
      tierPrice: priceRaw !== null && priceRaw !== undefined ? Number(priceRaw) : null,
      stock: p.inventory.map(i => ({ tag: i.location.shortTag, qty: i.quantity })),
    };
  });
}
