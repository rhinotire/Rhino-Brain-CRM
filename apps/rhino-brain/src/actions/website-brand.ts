"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { uploadBrandAsset, deleteBrandAsset, isStorageConfigured } from "@/lib/storage";

const MAX = 5 * 1024 * 1024;
const MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

/** Owner uploads the website logo for a brand (shown in the public site header). */
export async function uploadBrandLogo(_prev: unknown, formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  const session = await requireSession();
  if (session.role !== "ADMIN") return { error: "Admin only." };
  if (!isStorageConfigured()) return { error: "Image storage is not configured." };

  const brandKey = String(formData.get("brandKey") ?? "");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an image file." };
  if (file.size > MAX) return { error: "Image too large (max 5 MB)." };
  const ext = MIME[file.type];
  if (!ext) return { error: "Use a PNG, JPG, WebP, or SVG file." };

  const brand = await db.brandConfig.findUnique({ where: { key: brandKey }, select: { id: true, logoPath: true } });
  if (!brand) return { error: "Brand not found." };

  const path = `${brandKey.toLowerCase()}-logo-${Date.now()}.${ext}`;
  try {
    await uploadBrandAsset(path, await file.arrayBuffer(), file.type);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Upload failed." };
  }
  if (brand.logoPath) await deleteBrandAsset(brand.logoPath);
  await db.brandConfig.update({ where: { id: brand.id }, data: { logoPath: path } });
  revalidatePath("/settings/website");
  return { ok: true };
}

export async function removeBrandLogo(brandKey: string): Promise<{ ok?: boolean; error?: string }> {
  const session = await requireSession();
  if (session.role !== "ADMIN") return { error: "Admin only." };
  const brand = await db.brandConfig.findUnique({ where: { key: brandKey }, select: { id: true, logoPath: true } });
  if (!brand) return { error: "Brand not found." };
  if (brand.logoPath) await deleteBrandAsset(brand.logoPath);
  await db.brandConfig.update({ where: { id: brand.id }, data: { logoPath: null } });
  revalidatePath("/settings/website");
  return { ok: true };
}
