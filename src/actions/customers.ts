"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireSession, isManager, defaultLocationId } from "@/lib/auth";
import { customerSchema } from "@/lib/validations";
import type { ActionResult } from "./auth";
import type { CustomerType, CustomerSource, ProductCategory, CustomerStatus, Tier } from "@prisma/client";

function parseForm(formData: FormData) {
  return customerSchema.safeParse(Object.fromEntries(formData.entries()));
}

export async function createCustomer(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const session = await requireSession();
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
