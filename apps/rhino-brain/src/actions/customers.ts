"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireSession, isManager, isAccounting, defaultLocationId } from "@/lib/auth";
import { customerSchema } from "@/lib/validations";
import { uploadObject, isStorageConfigured } from "@/lib/storage";
import type { ActionResult } from "./auth";
import type { CustomerType, CustomerSource, ProductCategory, CustomerStatus, Tier, DocumentType } from "@prisma/client";

function parseForm(formData: FormData) {
  // Keep only string fields — file inputs (document uploads) are handled separately
  const entries = Object.fromEntries([...formData.entries()].filter(([, v]) => typeof v === "string"));
  return customerSchema.safeParse(entries);
}

const SENSITIVE_TYPES: DocumentType[] = ["DRIVER_LICENSE", "CREDIT_CARD_AUTH"];
const DOC_MAX_SIZE = 10 * 1024 * 1024;
const DOC_MIME = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"];

/** Uploads any doc_<TYPE> files included in the new-customer form. Failures don't block creation. */
async function uploadNewCustomerDocs(formData: FormData, customerId: string, userId: string) {
  if (!isStorageConfigured()) return;
  const types: DocumentType[] = ["ACCOUNT_APPLICATION", "RESALE_CERTIFICATE", "DRIVER_LICENSE", "CREDIT_CARD_AUTH", "W9_FORM"];
  for (const type of types) {
    const file = formData.get(`doc_${type}`);
    if (!(file instanceof File) || file.size === 0) continue;
    if (file.size > DOC_MAX_SIZE || !DOC_MIME.includes(file.type)) continue;
    try {
      const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(-100);
      const storagePath = `${customerId}/${type}/${Date.now()}-${safeName}`;
      await uploadObject(storagePath, await file.arrayBuffer(), file.type);
      const expiresRaw = type === "RESALE_CERTIFICATE" ? String(formData.get("doc_RESALE_CERTIFICATE_expiry") ?? "") : "";
      await db.customerDocument.create({
        data: {
          customerId, type,
          fileName: file.name, storagePath, fileSize: file.size, mimeType: file.type,
          expiresAt: expiresRaw ? new Date(expiresRaw) : null,
          sensitive: SENSITIVE_TYPES.includes(type),
          uploadedById: userId,
        },
      });
    } catch (e) {
      console.error(`Document upload failed for ${type}:`, e);
    }
  }
}

export async function createCustomer(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const session = await requireSession();
  if (isAccounting(session)) return { ok: false, error: "Accounting is read-only." };
  const parsed = parseForm(formData);
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0].message };

  const d = parsed.data;
  const { locationId: requestedLoc, ...rest } = d;
  const customer = await db.customer.create({
    data: {
      ...rest,
      interests: [d.mainInterest],
      // reps can only create customers assigned to themselves
      assignedRepId: isManager(session) ? d.assignedRepId || null : session.userId,
      locationId: defaultLocationId(session, requestedLoc),
    },
  });
  await uploadNewCustomerDocs(formData, customer.id, session.userId);
  revalidatePath("/customers");
  redirect(`/customers/${customer.id}`);
}

export async function updateCustomer(customerId: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const session = await requireSession();
  const parsed = parseForm(formData);
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0].message };

  const existing = await db.customer.findUnique({ where: { id: customerId } });
  if (!existing) return { ok: false, error: "Customer not found." };
  if (!isManager(session) && existing.assignedRepId !== session.userId)
    return { ok: false, error: "You can only edit customers assigned to you." };

  const d = parsed.data;
  const { locationId: requestedLoc, ...rest } = d;
  await db.customer.update({
    where: { id: customerId },
    data: {
      ...rest,
      assignedRepId: isManager(session) ? d.assignedRepId || null : existing.assignedRepId,
      locationId: session.role === "ADMIN" && requestedLoc ? requestedLoc : existing.locationId,
    },
  });
  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/customers");
  return { ok: true };
}

export async function deleteCustomer(customerId: string): Promise<ActionResult> {
  const session = await requireSession();
  if (!isManager(session)) return { ok: false, error: "Only managers can delete customers." };
  await db.customer.delete({ where: { id: customerId } });
  revalidatePath("/customers");
  redirect("/customers");
}

/** Mark a customer INACTIVE with a reason (logged to the activity trail). */
export async function setCustomerInactive(customerId: string, reason: string): Promise<ActionResult> {
  const session = await requireSession();
  if (isAccounting(session)) return { ok: false, error: "Accounting is read-only." };
  const existing = await db.customer.findUnique({ where: { id: customerId }, select: { assignedRepId: true, locationId: true } });
  if (!existing) return { ok: false, error: "Customer not found." };
  if (!isManager(session) && existing.assignedRepId !== session.userId) return { ok: false, error: "You can only change customers assigned to you." };
  const r = reason.trim().slice(0, 500);
  if (!r) return { ok: false, error: "Please give a reason." };
  await db.customer.update({ where: { id: customerId }, data: { status: "INACTIVE", inactiveReason: r } });
  await db.activity.create({ data: { type: "INTERNAL_NOTE", subject: "Marked INACTIVE", notes: r, customerId, repId: session.userId, locationId: existing.locationId, meaningful: false } });
  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/customers");
  return { ok: true };
}

/** Reactivate an INACTIVE customer (clears the reason, logged to the trail). */
export async function reactivateCustomer(customerId: string): Promise<ActionResult> {
  const session = await requireSession();
  if (isAccounting(session)) return { ok: false, error: "Accounting is read-only." };
  const existing = await db.customer.findUnique({ where: { id: customerId }, select: { assignedRepId: true, locationId: true } });
  if (!existing) return { ok: false, error: "Customer not found." };
  if (!isManager(session) && existing.assignedRepId !== session.userId) return { ok: false, error: "You can only change customers assigned to you." };
  await db.customer.update({ where: { id: customerId }, data: { status: "ACTIVE", inactiveReason: null } });
  await db.activity.create({ data: { type: "INTERNAL_NOTE", subject: "Reactivated customer", customerId, repId: session.userId, locationId: existing.locationId, meaningful: false } });
  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/customers");
  return { ok: true };
}

// ---------- CSV import ----------

const typeMap: Record<string, CustomerType> = {
  "tire shop": "TIRE_SHOP", "car dealer": "CAR_DEALER", "trailer manufacturer": "TRAILER_MANUFACTURER",
  fleet: "FLEET", "repair shop": "REPAIR_SHOP", "wholesale dealer": "WHOLESALE_DEALER",
  "online buyer": "ONLINE_BUYER",
};
const sourceMap: Record<string, CustomerSource> = {
  google: "GOOGLE", facebook: "FACEBOOK", referral: "REFERRAL", "walk-in": "WALK_IN",
  existing: "EXISTING", "cold call": "COLD_CALL", website: "WEBSITE", marketplace: "MARKETPLACE",
};
const interestMap: Record<string, ProductCategory> = {
  "pcr tires": "PCR_TIRES", "lt tires": "LT_TIRES", "tbr tires": "TBR_TIRES",
  "trailer tires": "TRAILER_TIRES", wheels: "WHEELS", "trailer parts": "TRAILER_PARTS",
  "oil / lubricants": "OIL_LUBRICANTS",
};

export type CsvCustomerRow = {
  companyName: string; contactPerson?: string; phone?: string; email?: string;
  city?: string; state?: string; zip?: string; address?: string;
  type?: string; source?: string; mainInterest?: string; tier?: string; status?: string;
};

/** Bulk import from client-parsed CSV rows (papaparse on the client). */
export async function importCustomers(rows: CsvCustomerRow[], fileName: string): Promise<{ ok: boolean; imported: number; failed: number; error?: string }> {
  const session = await requireSession();
  if (rows.length === 0) return { ok: false, imported: 0, failed: 0, error: "No rows found in file." };
  if (rows.length > 2000) return { ok: false, imported: 0, failed: 0, error: "Limit 2,000 rows per import." };

  let imported = 0, failed = 0;
  for (const r of rows) {
    if (!r.companyName?.trim()) { failed++; continue; }
    try {
      await db.customer.create({
        data: {
          companyName: r.companyName.trim(),
          contactPerson: r.contactPerson?.trim() || null,
          phone: r.phone?.trim() || null,
          email: r.email?.trim() || null,
          address: r.address?.trim() || null,
          city: r.city?.trim() || null,
          state: r.state?.trim() || null,
          zip: r.zip?.trim() || null,
          type: typeMap[r.type?.toLowerCase() || ""] ?? "OTHER",
          source: sourceMap[r.source?.toLowerCase() || ""] ?? "OTHER",
          mainInterest: interestMap[r.mainInterest?.toLowerCase() || ""] ?? "OTHER",
          tier: (["A","B","C","D"].includes(r.tier?.toUpperCase() || "") ? r.tier!.toUpperCase() : "C") as Tier,
          status: (["LEAD","PROSPECT","ACTIVE","INACTIVE","LOST"].includes(r.status?.toUpperCase() || "") ? r.status!.toUpperCase() : "PROSPECT") as CustomerStatus,
          assignedRepId: isManager(session) ? null : session.userId,
          locationId: defaultLocationId(session, null),
          externalSource: "csv-import",
        },
      });
      imported++;
    } catch { failed++; }
  }

  await db.importBatch.create({
    data: { entity: "customers", fileName, rowCount: rows.length, successful: imported, failed, userId: session.userId },
  });
  revalidatePath("/customers");
  return { ok: true, imported, failed };
}
