"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, inLocation, type Session } from "@/lib/auth";
import { uploadObject, isStorageConfigured } from "@/lib/storage";
import type { ActionResult } from "./auth";

/**
 * Resale-certificate verification trail: a human checks the official state
 * registry (FL DOR / Sunbiz, TX Comptroller — no public APIs exist, so a
 * reliable automated check isn't possible) and records the outcome here,
 * optionally with a screenshot as evidence. Rechecks are reminded yearly.
 */
export async function recordCertVerification(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const session: Session = await requireSession();
  const documentId = String(formData.get("documentId") ?? "");
  const status = ["VERIFIED", "FAILED"].includes(String(formData.get("status"))) ? String(formData.get("status")) : null;
  if (!status) return { ok: false, error: "Pick Verified or Failed." };
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 400) || null;

  const doc = await db.customerDocument.findUnique({
    where: { id: documentId },
    select: { id: true, customerId: true, customer: { select: { locationId: true, companyName: true } } },
  });
  if (!doc) return { ok: false, error: "Document not found." };
  if (!inLocation(session, doc.customer.locationId)) return { ok: false, error: "Not your company's customer." };

  // evidence screenshot (optional)
  let evidencePath: string | null = null;
  const evidence = formData.get("evidence");
  if (evidence instanceof File && evidence.size > 0 && evidence.type.startsWith("image/") && evidence.size <= 8 * 1024 * 1024 && isStorageConfigured()) {
    evidencePath = `${doc.customerId}/VERIFY_EVIDENCE/${Date.now()}.jpg`;
    await uploadObject(evidencePath, await evidence.arrayBuffer(), evidence.type).catch(() => { evidencePath = null; });
  }

  await db.customerDocument.update({
    where: { id: documentId },
    data: {
      verifyStatus: status,
      verifiedAt: new Date(),
      verifiedById: session.userId,
      verifyNotes: notes,
      ...(evidencePath ? { evidencePath } : {}),
      lastRemindedOn: null, // a fresh verification resets the recheck clock
    },
  });
  await db.activity.create({
    data: {
      type: "INTERNAL_NOTE",
      subject: status === "VERIFIED" ? "Resale certificate verified against official registry" : "⚠️ Resale certificate FAILED official verification",
      notes: [notes, evidencePath ? "Screenshot evidence attached." : null].filter(Boolean).join("\n") || undefined,
      customerId: doc.customerId,
      repId: session.userId,
      locationId: doc.customer.locationId,
      meaningful: status === "FAILED",
    },
  }).catch(() => {});
  revalidatePath(`/customers/${doc.customerId}`);
  return { ok: true };
}
