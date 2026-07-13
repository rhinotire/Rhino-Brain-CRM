"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireManager } from "@/lib/auth";
import { validateSpecField } from "@rhino/services";

/** Fields the enrichment pipeline is allowed to write. Ints vs strings matter for Prisma. */
const INT_FIELDS = new Set(["plyRating", "mileageWarrantyMiles"]);
const REVIEWABLE = new Set(["loadRange", "plyRating", "position", "treadType", "construction", "loadIndex", "speedRating", "application", "mileageWarrantyMiles"]);

function toSpecData(fields: Record<string, string | number>): Record<string, string | number> {
  const data: Record<string, string | number> = {};
  for (const [f, v] of Object.entries(fields)) data[f] = INT_FIELDS.has(f) ? Number(v) : String(v);
  return data;
}

/**
 * Approve an AI spec proposal: merge the checked (possibly edited) fields into
 * TireSpec. The reviewer's word is final — approved values overwrite.
 */
export async function approveSpecProposal(formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  const session = await requireManager();
  const id = String(formData.get("proposalId") ?? "");
  const proposal = await db.specProposal.findUnique({ where: { id }, select: { productId: true, status: true, fieldsJson: true } });
  if (!proposal || proposal.status !== "PENDING") return { error: "Proposal not found or already reviewed." };

  const proposed = proposal.fieldsJson as Record<string, { value: string | number }>;
  const accepted: Record<string, string | number> = {};
  const rejectedFields: string[] = [];
  for (const field of Object.keys(proposed)) {
    if (!REVIEWABLE.has(field)) continue;
    if (formData.get(`use-${field}`) !== "on") continue;
    const raw = formData.get(`value-${field}`) ?? proposed[field].value;
    const valid = validateSpecField(field, raw);
    if (valid === null) { rejectedFields.push(field); continue; }
    accepted[field] = valid;
  }
  if (rejectedFields.length) return { error: `Invalid value for: ${rejectedFields.join(", ")}` };

  if (Object.keys(accepted).length > 0) {
    const data = toSpecData(accepted);
    await db.tireSpec.upsert({
      where: { productId: proposal.productId },
      update: data,
      create: { productId: proposal.productId, ...data },
    });
  }
  await db.specProposal.update({
    where: { id },
    data: { status: "APPROVED", reviewedAt: new Date(), reviewedById: session.userId },
  });
  revalidatePath("/spec-review");
  return { ok: true };
}

export async function rejectSpecProposal(formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  const session = await requireManager();
  const id = String(formData.get("proposalId") ?? "");
  const proposal = await db.specProposal.findUnique({ where: { id }, select: { status: true } });
  if (!proposal || proposal.status !== "PENDING") return { error: "Proposal not found or already reviewed." };
  await db.specProposal.update({
    where: { id },
    data: { status: "REJECTED", reviewedAt: new Date(), reviewedById: session.userId },
  });
  revalidatePath("/spec-review");
  return { ok: true };
}

export type SpecCsvRow = { sku: string; values: Record<string, string> };

/**
 * CSV/Excel gap-sheet import (layer 3). Human-provided data, but still
 * validated against the controlled vocabulary; bad cells are reported, not
 * silently written. Only non-empty cells are applied; they overwrite.
 */
export async function importSpecCsv(
  fileName: string,
  rows: SpecCsvRow[]
): Promise<{ ok?: boolean; updated?: number; unknownSkus?: number; badCells?: string[]; error?: string }> {
  const session = await requireManager();
  if (rows.length === 0) return { error: "No rows found in the file." };
  if (rows.length > 5000) return { error: "Too many rows (max 5000)." };

  let updated = 0;
  let unknownSkus = 0;
  const badCells: string[] = [];

  for (const row of rows) {
    const sku = row.sku.trim();
    if (!sku) continue;
    const product = await db.product.findUnique({ where: { sku }, select: { id: true } });
    if (!product) { unknownSkus++; continue; }

    const accepted: Record<string, string | number> = {};
    for (const [field, raw] of Object.entries(row.values)) {
      if (!REVIEWABLE.has(field) || !String(raw).trim()) continue;
      const valid = validateSpecField(field, raw);
      if (valid === null) { badCells.push(`${sku}: ${field}="${String(raw).slice(0, 30)}"`); continue; }
      accepted[field] = valid;
    }
    if (Object.keys(accepted).length === 0) continue;

    const data = toSpecData(accepted);
    await db.tireSpec.upsert({
      where: { productId: product.id },
      update: data,
      create: { productId: product.id, ...data },
    });
    updated++;
  }

  await db.importBatch.create({
    data: { entity: "TIRE_SPECS", fileName, rowCount: rows.length, successful: updated, failed: badCells.length + unknownSkus, userId: session.userId },
  });

  revalidatePath("/spec-review");
  return { ok: true, updated, unknownSkus, badCells: badCells.slice(0, 12) };
}
