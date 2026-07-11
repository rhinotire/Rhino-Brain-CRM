"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, locationScope } from "@/lib/auth";

/** Manual working statuses for the front desk / sales (MVP-A). */
const ALLOWED: string[] = [
  "INSTALLER_CONTACTED",
  "INSTALLATION_REQUESTED",
  "INSTALLATION_SCHEDULED",
  "INSTALLATION_COMPLETED",
  "MANUAL_ASSISTANCE_REQUIRED",
  "LOST",
  "CANCELLED",
];

export async function updateConsumerLeadStatus(id: string, status: string): Promise<{ ok?: boolean; error?: string }> {
  const session = await requireSession();
  if (!ALLOWED.includes(status)) return { error: "Invalid status." };
  // company isolation: the lead must be visible to this user's location scope
  const lead = await db.consumerLead.findFirst({ where: { id, ...locationScope(session) }, select: { id: true, status: true } });
  if (!lead) return { error: "Not found." };
  await db.$transaction([
    db.consumerLead.update({ where: { id }, data: { status: status as never } }),
    db.referralStatusHistory.create({
      data: { consumerLeadId: id, fromStatus: lead.status, toStatus: status, actor: session.userId },
    }),
  ]);
  revalidatePath("/consumer-leads");
  return { ok: true };
}

export async function assignConsumerLead(id: string, repId: string): Promise<{ ok?: boolean; error?: string }> {
  const session = await requireSession();
  const lead = await db.consumerLead.findFirst({ where: { id, ...locationScope(session) }, select: { id: true } });
  if (!lead) return { error: "Not found." };
  const rep = await db.user.findFirst({ where: { id: repId, active: true }, select: { id: true } });
  if (!rep) return { error: "Rep not found." };
  await db.consumerLead.update({ where: { id }, data: { assignedRepId: repId } });
  revalidatePath("/consumer-leads");
  return { ok: true };
}
