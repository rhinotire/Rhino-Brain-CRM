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

const KINDS = {
  logo: "logoPath",
  hero: "heroImagePath",
} as const;
type Kind = keyof typeof KINDS;

// Hero photos are large; logos stay small
const MAX_BY_KIND: Record<Kind, number> = { logo: MAX, hero: 8 * 1024 * 1024 };

/** Owner uploads a brand image (header logo or homepage hero banner). */
export async function uploadBrandImage(_prev: unknown, formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  const session = await requireSession();
  if (session.role !== "ADMIN") return { error: "Admin only." };
  if (!isStorageConfigured()) return { error: "Image storage is not configured." };

  const brandKey = String(formData.get("brandKey") ?? "");
  const kind = String(formData.get("kind") ?? "") as Kind;
  const column = KINDS[kind];
  if (!column) return { error: "Invalid image type." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an image file." };
  if (file.size > MAX_BY_KIND[kind]) return { error: `Image too large (max ${Math.round(MAX_BY_KIND[kind] / 1024 / 1024)} MB).` };
  const ext = MIME[file.type];
  if (!ext) return { error: "Use a PNG, JPG, WebP, or SVG file." };

  const brand = await db.brandConfig.findUnique({ where: { key: brandKey }, select: { id: true, logoPath: true, heroImagePath: true } });
  if (!brand) return { error: "Brand not found." };

  const path = `${brandKey.toLowerCase()}-${kind}-${Date.now()}.${ext}`;
  try {
    await uploadBrandAsset(path, await file.arrayBuffer(), file.type);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Upload failed." };
  }
  const old = brand[column];
  if (old) await deleteBrandAsset(old);
  await db.brandConfig.update({ where: { id: brand.id }, data: { [column]: path } });
  revalidatePath("/settings/website");
  return { ok: true };
}

export async function removeBrandImage(brandKey: string, kind: Kind): Promise<{ ok?: boolean; error?: string }> {
  const session = await requireSession();
  if (session.role !== "ADMIN") return { error: "Admin only." };
  const column = KINDS[kind];
  if (!column) return { error: "Invalid image type." };
  const brand = await db.brandConfig.findUnique({ where: { key: brandKey }, select: { id: true, logoPath: true, heroImagePath: true } });
  if (!brand) return { error: "Brand not found." };
  const old = brand[column];
  if (old) await deleteBrandAsset(old);
  await db.brandConfig.update({ where: { id: brand.id }, data: { [column]: null } });
  revalidatePath("/settings/website");
  return { ok: true };
}
