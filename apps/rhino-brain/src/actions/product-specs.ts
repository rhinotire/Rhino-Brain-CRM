"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireManager } from "@/lib/auth";
import type { ActionResult } from "./auth";

/**
 * Category-specific spec editors for non-tire products: wheels and trailer
 * parts have their own satellite tables (WheelSpec / PartSpec) — the tire
 * form never applied to them (owner feedback).
 */

const num = (v: FormDataEntryValue | null, min: number, max: number): number | null => {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};
const str = (v: FormDataEntryValue | null, max = 80): string | null =>
  String(v ?? "").trim().slice(0, max) || null;

export async function saveWheelSpec(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireManager();
  const productId = String(formData.get("productId") ?? "");
  const product = await db.product.findUnique({ where: { id: productId }, select: { id: true } });
  if (!product) return { ok: false, error: "Product not found." };

  const boltRaw = str(formData.get("boltPattern"), 20);
  const boltPattern = boltRaw ? boltRaw.toLowerCase().replace(/\s+/g, "").replace("×", "x") : null;
  if (boltPattern && !/^\d{1,2}x\d{1,2}(\.\d{1,2})?$/.test(boltPattern)) {
    return { ok: false, error: `Bolt pattern should look like "5x4.5" or "6x5.5".` };
  }
  const data = {
    diameterIn: num(formData.get("diameterIn"), 4, 30),
    widthIn: num(formData.get("widthIn"), 2, 20),
    boltPattern,
    lugCount: boltPattern ? Number(boltPattern.split("x")[0]) : num(formData.get("lugCount"), 3, 12),
    centerBoreMm: num(formData.get("centerBoreMm"), 30, 300),
    offsetMm: num(formData.get("offsetMm"), -100, 100),
    backspacingIn: num(formData.get("backspacingIn"), 1, 12),
    loadRatingLbs: num(formData.get("loadRatingLbs"), 200, 15000),
    finish: str(formData.get("finish")),
    material: str(formData.get("material"), 30),
  };
  await db.wheelSpec.upsert({ where: { productId }, create: { productId, ...data }, update: data });
  revalidatePath(`/products/${productId}/specs`);
  return { ok: true };
}

export async function savePartSpec(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireManager();
  const productId = String(formData.get("productId") ?? "");
  const product = await db.product.findUnique({ where: { id: productId }, select: { id: true } });
  if (!product) return { ok: false, error: "Product not found." };

  const data = {
    partType: str(formData.get("partType"), 60),
    capacity: str(formData.get("capacity"), 60),
    dimensions: str(formData.get("dimensions"), 120),
    material: str(formData.get("material"), 60),
    mountingType: str(formData.get("mountingType"), 60),
    compatibilityNotes: str(formData.get("compatibilityNotes"), 300),
    certGrade: str(formData.get("certGrade"), 60),
  };
  await db.partSpec.upsert({ where: { productId }, create: { productId, ...data }, update: data });
  revalidatePath(`/products/${productId}/specs`);
  return { ok: true };
}
