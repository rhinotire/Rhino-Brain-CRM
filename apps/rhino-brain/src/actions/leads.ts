"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, isManager, defaultLocationId, canWrite } from "@/lib/auth";
import { leadSchema } from "@/lib/validations";
import type { ActionResult } from "./auth";
import type { PipelineStage, LostReason } from "@prisma/client";

async function assertLeadAccess(leadId: string) {
  const session = await requireSession();
  const lead = await db.lead.findUnique({ where: { id: leadId } });
  if (!lead) throw new Error("Lead not found");
  if (!isManager(session) && lead.assignedRepId !== session.userId) throw new Error("Not your lead");
  return { session, lead };
}

export async function createLead(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const session = await requireSession();
  const parsed = leadSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0].message };

  const d = parsed.data;
  const { locationId: requestedLoc, ...rest } = d;
  const assignedRepId = isManager(session) ? d.assignedRepId || null : session.userId;
  const lead = await db.lead.create({ data: { ...rest, assignedRepId, locationId: defaultLocationId(session, requestedLoc) } });

  // Notify the rep when a manager assigns a lead to someone else
  if (assignedRepId && assignedRepId !== session.userId) {
    await db.notification.create({
      data: {
        type: "LEAD_ASSIGNED",
        title: `New lead assigned: ${lead.companyName}`,
        link: "/pipeline",
        userId: assignedRepId,
      },
    });
  }
  revalidatePath("/pipeline");
  revalidatePath("/leads");
  return { ok: true };
}

export async function moveLeadStage(leadId: string, stage: PipelineStage): Promise<ActionResult> {
  try {
    await assertLeadAccess(leadId);
    await db.lead.update({ where: { id: leadId }, data: { stage, lastActivityAt: new Date() } });
    revalidatePath("/pipeline");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function assignLead(leadId: string, repId: string): Promise<ActionResult> {
  const session = await requireSession();
  if (!isManager(session)) return { ok: false, error: "Only managers can reassign leads." };
  const lead = await db.lead.findUnique({ where: { id: leadId }, select: { locationId: true, companyName: true } });
  if (!lead) return { ok: false, error: "Lead not found." };
  if (!canWrite(session, { locationId: lead.locationId })) return { ok: false, error: "Lead not in your company." };
  await db.lead.update({ where: { id: leadId }, data: { assignedRepId: repId || null } });
  if (repId) {
    await db.notification.create({
      data: { type: "LEAD_ASSIGNED", title: `New lead assigned: ${lead.companyName ?? ""}`, link: "/pipeline", userId: repId },
    });
  }
  revalidatePath("/pipeline");
  revalidatePath("/leads");
  return { ok: true };
}

export async function markLeadLost(leadId: string, reason: LostReason, note?: string): Promise<ActionResult> {
  try {
    await assertLeadAccess(leadId);
    await db.lead.update({
      where: { id: leadId },
      data: { stage: "LOST", lostReason: reason, lostNote: note || null },
    });
    revalidatePath("/pipeline");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Convert a lead into an Active customer, carrying over contact info + activities. */
export async function convertLead(leadId: string): Promise<ActionResult> {
  try {
    const { lead } = await assertLeadAccess(leadId);
    if (lead.convertedCustomerId) return { ok: false, error: "Lead already converted." };

    const customer = await db.customer.create({
      data: {
        companyName: lead.companyName,
        contactPerson: lead.contactPerson,
        phone: lead.phone,
        email: lead.email,
        city: lead.city,
        state: lead.state,
        type: lead.type,
        source: lead.source,
        mainInterest: lead.interest,
        interests: [lead.interest],
        status: "ACTIVE",
        assignedRepId: lead.assignedRepId,
        locationId: lead.locationId,
        lastContactAt: lead.lastActivityAt,
        notes: lead.notes,
      },
    });
    await db.$transaction([
      db.activity.updateMany({ where: { leadId }, data: { customerId: customer.id } }),
      db.lead.update({ where: { id: leadId }, data: { stage: "ACTIVE_CUSTOMER", convertedCustomerId: customer.id, convertedAt: new Date() } }),
    ]);
    revalidatePath("/pipeline");
    revalidatePath("/customers");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export type CsvLeadRow = {
  companyName: string; contactPerson?: string; phone?: string; email?: string;
  city?: string; state?: string; type?: string; source?: string; interest?: string;
};

export async function importLeads(rows: CsvLeadRow[], fileName: string): Promise<{ ok: boolean; imported: number; failed: number; error?: string }> {
  const session = await requireSession();
  if (rows.length === 0) return { ok: false, imported: 0, failed: 0, error: "No rows found in file." };
  if (rows.length > 2000) return { ok: false, imported: 0, failed: 0, error: "Limit 2,000 rows per import." };

  const batch = await db.importBatch.create({
    data: { entity: "leads", fileName, rowCount: rows.length, successful: 0, failed: 0, userId: session.userId },
  });

  let imported = 0, failed = 0;
  for (const r of rows) {
    if (!r.companyName?.trim()) { failed++; continue; }
    try {
      await db.lead.create({
        data: {
          companyName: r.companyName.trim(),
          contactPerson: r.contactPerson?.trim() || null,
          phone: r.phone?.trim() || null,
          email: r.email?.trim() || null,
          city: r.city?.trim() || null,
          state: r.state?.trim() || null,
          assignedRepId: isManager(session) ? null : session.userId,
          locationId: defaultLocationId(session, null),
          importBatchId: batch.id,
        },
      });
      imported++;
    } catch { failed++; }
  }
  await db.importBatch.update({ where: { id: batch.id }, data: { successful: imported, failed } });
  revalidatePath("/pipeline");
  revalidatePath("/leads");
  return { ok: true, imported, failed };
}
