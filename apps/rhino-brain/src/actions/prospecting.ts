"use server";

import { revalidatePath } from "next/cache";
import { addExclusion } from "@rhino/services";
import { db } from "@/lib/db";
import { requireManager, locationScope } from "@/lib/auth";

/** Calibration queue verdicts (spec §6.2). FOLLOW keeps the AI grade and
 * optionally assigns a rep; REJECT moves the lead to pool D and (optionally)
 * writes an ExclusionList rule so collectors never resurface the company. */
export async function calibrateLead(
  leadId: string,
  verdict: "FOLLOW" | "REJECT",
  opts?: { repId?: string; reason?: string; alsoExclude?: boolean }
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireManager();
  const lead = await db.lead.findUnique({ where: { id: leadId } });
  if (!lead) return { ok: false, error: "Lead not found" };
  if (lead.reviewedAt) return { ok: false, error: "Already reviewed" };

  const scope = locationScope(session);
  if (scope.locationId && lead.locationId !== scope.locationId) return { ok: false, error: "Lead belongs to another location" };

  if (verdict === "FOLLOW") {
    const { count } = await db.lead.updateMany({
      where: { id: leadId, reviewedAt: null },
      data: {
        reviewedAt: new Date(),
        reviewedById: session.userId,
        ...(opts?.repId ? { assignedRepId: opts.repId } : {}),
      },
    });
    if (count !== 1) return { ok: false, error: "Already reviewed" };
  } else {
    if (!opts?.reason) return { ok: false, error: "Reject needs a reason" };
    const { count } = await db.lead.updateMany({
      where: { id: leadId, reviewedAt: null },
      data: { reviewedAt: new Date(), reviewedById: session.userId, pool: "D_EXCLUDED", rejectReason: opts.reason },
    });
    if (count !== 1) return { ok: false, error: "Already reviewed" };
    if (opts.alsoExclude) {
      const meta = (lead.meta ?? {}) as { website?: string };
      await addExclusion({
        kind: "RISK",
        companyName: lead.companyName,
        website: meta.website,
        phone: lead.phone,
        reason: `calibration reject: ${opts.reason}`,
        addedById: session.userId,
      });
    }
  }
  revalidatePath("/prospecting");
  return { ok: true };
}

export async function listRepsForAssign(): Promise<Array<{ id: string; name: string }>> {
  const session = await requireManager();
  const reps = await db.user.findMany({
    where: { active: true, ...locationScope(session) },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return reps;
}
