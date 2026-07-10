"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, requireManager } from "@/lib/auth";

/** Managers flag products as discontinued — the flyer auto-pick clears these first. */
export async function setDiscontinued(productId: string, value: boolean): Promise<{ ok?: boolean; error?: string }> {
  await requireManager();
  await db.product.update({ where: { id: productId }, data: { discontinued: value } });
  revalidatePath("/products");
  return { ok: true };
}

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

/** Distinct product categories (raw labels) for filter dropdowns. */
export async function listProductCategories(): Promise<string[]> {
  await requireSession();
  const rows = await db.product.findMany({
    where: { active: true, rawCategory: { not: null } },
    distinct: ["rawCategory"],
    select: { rawCategory: true },
    orderBy: { rawCategory: "asc" },
  });
  return rows.map(r => r.rawCategory!).filter(Boolean);
}

/** Distinct brands for filter dropdowns. */
export async function listProductBrands(): Promise<string[]> {
  await requireSession();
  const rows = await db.product.findMany({
    where: { active: true, brand: { not: null } },
    distinct: ["brand"],
    select: { brand: true },
    orderBy: { brand: "asc" },
  });
  return rows.map(r => r.brand!).filter(b => b && b.trim());
}

/**
 * Live product search — matches size/SKU/brand/description, optionally scoped to
 * a category. With a category set, an empty query lists that category's products.
 */
export async function searchProducts(query: string, customerId?: string, category?: string, brand?: string): Promise<ProductHit[]> {
  await requireSession();
  const q = query.trim();
  const cat = category?.trim();
  const br = brand?.trim();
  if (q.length < 2 && !cat && !br) return []; // need text, a category, or a brand to search

  const tier = customerId
    ? (await db.customer.findUnique({ where: { id: customerId }, select: { tier: true } }))?.tier ?? null
    : null;

  const products = await db.product.findMany({
    where: {
      active: true,
      ...(cat ? { rawCategory: cat } : {}),
      ...(br ? { brand: br } : {}),
      ...(q.length >= 2 ? {
        OR: [
          { sizeSpec: { contains: q, mode: "insensitive" } },
          { sku: { contains: q, mode: "insensitive" } },
          { brand: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
        ],
      } : {}),
    },
    orderBy: [{ sizeSpec: "asc" }, { sku: "asc" }],
    take: (cat || br) && q.length < 2 ? 40 : 12,
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
