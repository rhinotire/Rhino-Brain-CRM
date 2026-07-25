"use server";

import { revalidatePath } from "next/cache";
import {
  addExclusion,
  runProspectingPipeline,
  generateOutreachDraft as generateDraftService,
  type ProspectCategory,
  type PipelineResult,
  type OutreachDraft,
  type Enrichment,
} from "@rhino/services";
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

  // ADMIN's sidebar company filter is a view preference, not a permission —
  // it must not block calibrating unassigned or cross-company leads.
  const scope = locationScope(session);
  if (session.role !== "ADMIN" && scope.locationId && lead.locationId !== scope.locationId)
    return { ok: false, error: "Lead belongs to another location" };

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

/** ADMIN-only: run a Places collection from the CRM ("search" button). Costs
 * real API money, so capped at 20 candidates per run — bigger sweeps use the
 * CLI script. */
export async function runCollection(
  state: string,
  category: ProspectCategory,
  limit: number
): Promise<{ ok: boolean; error?: string; result?: PipelineResult }> {
  const session = await requireManager();
  if (session.role !== "ADMIN") return { ok: false, error: "Only ADMIN can run collections (they cost API budget)" };
  const placesKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!placesKey) return { ok: false, error: "GOOGLE_PLACES_API_KEY is not configured on the server (Vercel env)" };
  const capped = Math.max(1, Math.min(20, Math.floor(limit) || 10));
  try {
    const result = await runProspectingPipeline({ state, category, limit: capped, placesKey });
    revalidatePath("/prospecting");
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "collection failed" };
  }
}

/** Generate (or regenerate) the personalized first-touch draft for one lead.
 * Persisted into Lead.meta.outreachDraft so tokens aren't re-spent on reload. */
export async function generateOutreachDraft(
  leadId: string
): Promise<{ ok: boolean; error?: string; draft?: OutreachDraft }> {
  const session = await requireManager();
  const lead = await db.lead.findUnique({
    where: { id: leadId },
    include: { location: { select: { shortTag: true } } },
  });
  if (!lead) return { ok: false, error: "Lead not found" };
  const scope = locationScope(session);
  if (session.role !== "ADMIN" && scope.locationId && lead.locationId !== scope.locationId)
    return { ok: false, error: "Lead belongs to another location" };

  const meta = (lead.meta ?? {}) as Record<string, unknown>;
  try {
    const { draft } = await generateDraftService({
      companyName: lead.companyName,
      city: lead.city,
      state: lead.state,
      productLine: lead.productLine,
      enrichment: (lead.enrichment as Enrichment | null) ?? null,
      angle: typeof meta.angle === "string" ? meta.angle : null,
      senderCompany: lead.location?.shortTag === "TX" ? "Everflow Tire (Dallas, TX)" : "Rhino Tire USA (Orlando, FL)",
    });
    await db.lead.update({
      where: { id: leadId },
      data: { meta: { ...meta, outreachDraft: draft } },
    });
    revalidatePath("/prospecting");
    return { ok: true, draft };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "draft generation failed" };
  }
}
