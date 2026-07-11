"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, requireManager } from "@/lib/auth";
import { uploadProductImage, deleteProductImage, productImageUrl, isStorageConfigured } from "@/lib/storage";
import { ProductService } from "@rhino/services";

/** Managers flag products as discontinued — the flyer auto-pick clears these first. */
export async function setDiscontinued(productId: string, value: boolean): Promise<{ ok?: boolean; error?: string }> {
  await requireManager();
  await ProductService.setDiscontinued(productId, value);
  revalidatePath("/products");
  return { ok: true };
}

/** Managers publish/unpublish a product on the public website. */
export async function setPublished(productId: string, value: boolean): Promise<{ ok?: boolean; error?: string }> {
  await requireManager();
  try {
    await ProductService.setPublished(productId, value);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to update." };
  }
  revalidatePath("/products");
  return { ok: true };
}

const IMG_MAX = 5 * 1024 * 1024;
const IMG_MIME = ["image/jpeg", "image/png", "image/webp"];

/** Upload/replace a product's photo (reused on flyers). Returns the public URL. */
export async function uploadProductPhoto(_prev: unknown, formData: FormData): Promise<{ ok?: boolean; url?: string; error?: string }> {
  await requireManager();
  if (!isStorageConfigured()) return { error: "Image storage is not configured (SUPABASE keys missing)." };
  const productId = String(formData.get("productId") ?? "");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an image." };
  if (file.size > IMG_MAX) return { error: "Image too large (max 5 MB)." };
  if (!IMG_MIME.includes(file.type)) return { error: "Use a JPG, PNG, or WebP image." };
  const product = await db.product.findUnique({ where: { id: productId }, select: { sku: true, imagePath: true } });
  if (!product) return { error: "Product not found." };
  try {
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const path = `${product.sku.replace(/[^\w.-]+/g, "_")}-${Date.now()}.${ext}`;
    await uploadProductImage(path, await file.arrayBuffer(), file.type);
    if (product.imagePath) await deleteProductImage(product.imagePath);
    await db.product.update({ where: { id: productId }, data: { imagePath: path } });
    revalidatePath("/products");
    return { ok: true, url: productImageUrl(path) ?? undefined };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Upload failed." };
  }
}

export async function clearProductPhoto(productId: string): Promise<{ ok?: boolean; error?: string }> {
  await requireManager();
  const product = await db.product.findUnique({ where: { id: productId }, select: { imagePath: true } });
  if (product?.imagePath) await deleteProductImage(product.imagePath);
  await db.product.update({ where: { id: productId }, data: { imagePath: null } });
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
  imageUrl: string | null;  // saved product photo, reused on flyers
  stock: { tag: string; qty: number }[];
};

/** Distinct product categories (raw labels) for filter dropdowns. */
export async function listProductCategories(): Promise<string[]> {
  await requireSession();
  return ProductService.listCategories();
}

/** Distinct brands for filter dropdowns. */
export async function listProductBrands(): Promise<string[]> {
  await requireSession();
  return ProductService.listBrands();
}

/**
 * Live product search — matches size/SKU/brand/description, optionally scoped to
 * a category. With a category set, an empty query lists that category's products.
 */
export async function searchProducts(query: string, customerId?: string, category?: string, brand?: string): Promise<ProductHit[]> {
  await requireSession();
  const hits = await ProductService.search({ query, customerId, rawCategory: category, brand });
  // imagePath → public URL is presentation concern; storage stays app-side
  return hits.map(({ imagePath, ...h }) => ({ ...h, imageUrl: productImageUrl(imagePath) }));
}
