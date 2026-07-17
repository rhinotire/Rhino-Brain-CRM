"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireManager } from "@/lib/auth";
import { validateSpecField } from "@rhino/services";

/**
 * Manual tire-spec editor (CRM). Pattern-level fields (UTQG, mileage
 * warranty, tread type…) can be applied to every size of the same pattern in
 * one save — they're properties of the tread design, not the size.
 */

/** Fields that belong to the pattern, not the individual size. */
const PATTERN_FIELDS = ["treadType", "application", "position", "construction", "utqg", "sidewallStyle", "mileageWarrantyMiles", "threePMSF", "runFlat"] as const;
/** Fields that vary per size. */
const SIZE_FIELDS = ["loadIndex", "speedRating", "loadRange", "plyRating", "maxLoadLbs", "maxPressurePsi", "treadDepth32nds"] as const;

const INT_RANGES: Record<string, [number, number]> = {
  maxLoadLbs: [200, 15000],
  maxPressurePsi: [20, 200],
  plyRating: [2, 24],
  mileageWarrantyMiles: [10000, 120000],
};

function parseField(field: string, raw: string): { value: string | number | boolean | null } | { error: string } {
  const v = raw.trim();
  if (field === "threePMSF" || field === "runFlat") return { value: raw === "on" };
  if (v === "") return { value: null };
  // vocabulary/format-checked fields share the pipeline validator
  if (["treadType", "application", "position", "construction", "loadRange", "loadIndex", "speedRating", "plyRating", "mileageWarrantyMiles"].includes(field)) {
    const valid = validateSpecField(field, v);
    if (valid === null) return { error: `Invalid value for ${field}: "${v.slice(0, 30)}"` };
    return { value: valid };
  }
  if (field === "utqg" || field === "sidewallStyle") {
    if (v.length > 40) return { error: `${field} is too long.` };
    return { value: v.toUpperCase() };
  }
  if (field === "treadDepth32nds") {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 4 || n > 40) return { error: "Tread depth should be 4–40 (32nds)." };
    return { value: n };
  }
  const range = INT_RANGES[field];
  if (range) {
    const n = Number(v.replace(/[,\s]/g, ""));
    if (!Number.isInteger(n) || n < range[0] || n > range[1]) return { error: `${field} should be ${range[0].toLocaleString()}–${range[1].toLocaleString()}.` };
    return { value: n };
  }
  return { error: `Unknown field ${field}` };
}

export async function saveTireSpec(_prev: unknown, formData: FormData): Promise<{ ok?: boolean; appliedToPattern?: number; error?: string }> {
  await requireManager();
  const productId = String(formData.get("productId") ?? "");
  const product = await db.product.findUnique({ where: { id: productId }, select: { id: true, brand: true, pattern: true, category: true } });
  if (!product) return { error: "Product not found." };

  const patternName = String(formData.get("pattern") ?? "").trim().slice(0, 60) || null;

  const patternData: Record<string, string | number | boolean | null> = {};
  const sizeData: Record<string, string | number | boolean | null> = {};
  for (const f of PATTERN_FIELDS) {
    const parsed = parseField(f, String(formData.get(f) ?? ""));
    if ("error" in parsed) return { error: parsed.error };
    patternData[f] = parsed.value;
  }
  for (const f of SIZE_FIELDS) {
    const parsed = parseField(f, String(formData.get(f) ?? ""));
    if ("error" in parsed) return { error: parsed.error };
    sizeData[f] = parsed.value;
  }

  await db.product.update({ where: { id: productId }, data: { pattern: patternName } });
  await db.tireSpec.upsert({
    where: { productId },
    update: { ...patternData, ...sizeData },
    create: { productId, ...patternData, ...sizeData },
  });

  // optionally push the pattern-level fields (and the pattern name itself) to
  // every size of this pattern — matched by pattern column or, for ungrouped
  // rows, by the pattern name appearing in the description
  let appliedToPattern = 0;
  if (formData.get("applyToPattern") === "on" && patternName && product.brand) {
    const siblings = await db.product.findMany({
      where: {
        active: true,
        brand: product.brand,
        NOT: { id: productId },
        OR: [
          { pattern: patternName },
          { pattern: null, description: { contains: patternName, mode: "insensitive" } },
        ],
      },
      select: { id: true },
    });
    for (const s of siblings) {
      await db.product.update({ where: { id: s.id }, data: { pattern: patternName } });
      await db.tireSpec.upsert({
        where: { productId: s.id },
        update: patternData,
        create: { productId: s.id, ...patternData },
      });
      appliedToPattern++;
    }
  }

  revalidatePath("/products");
  return { ok: true, appliedToPattern };
}
