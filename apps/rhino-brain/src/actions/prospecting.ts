"use server";

import { revalidatePath } from "next/cache";
import {
  addExclusion,
  runProspectingPipeline,
  generateOutreachDraft as generateDraftService,
  findDecisionMakers,
  domainKey,
  type ProspectCategory,
  type PipelineResult,
  type OutreachDraft,
  type Enrichment,
  type ProspectContact,
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
export async function runCollection(params: {
  country: string;
  state?: string;
  category?: ProspectCategory;
  customQuery?: string;
  limit: number;
}): Promise<{ ok: boolean; error?: string; result?: PipelineResult }> {
  const session = await requireManager();
  if (session.role !== "ADMIN") return { ok: false, error: "Only ADMIN can run collections (they cost API budget)" };
  const placesKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!placesKey) return { ok: false, error: "GOOGLE_PLACES_API_KEY is not configured on the server (Vercel env)" };
  const capped = Math.max(1, Math.min(20, Math.floor(params.limit) || 10));
  try {
    const result = await runProspectingPipeline({
      country: params.country,
      state: params.state,
      category: params.category,
      customQuery: params.customQuery,
      limit: capped,
      placesKey,
    });
    revalidatePath("/prospecting");
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "collection failed" };
  }
}

/** Manually add a company to the protection/blacklist. Anything here is
 * invisible to collectors and (later) untouchable by outreach. */
export async function addExclusionEntry(input: {
  kind: "EXISTING_CUSTOMER" | "AGENT" | "COMPETITOR" | "OPTED_OUT" | "RISK" | "BLACKLIST";
  companyName: string;
  website?: string;
  phone?: string;
  reason?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const session = await requireManager();
  if (!input.companyName.trim()) return { ok: false, error: "Company name is required" };
  await addExclusion({ ...input, companyName: input.companyName.trim(), addedById: session.userId });
  revalidatePath("/prospecting/exclusions");
  return { ok: true };
}

/** Remove a protection entry — un-protects the company, so ADMIN only. */
export async function removeExclusion(id: string): Promise<{ ok: boolean; error?: string }> {
  const session = await requireManager();
  if (session.role !== "ADMIN") return { ok: false, error: "Only ADMIN can remove protection entries" };
  await db.exclusionList.delete({ where: { id } }).catch(() => null);
  revalidatePath("/prospecting/exclusions");
  return { ok: true };
}

/** Find named decision-makers (purchaser / president / owner) for one lead
 * via Apollo (+ RocketReach email fallback). Costs data credits, so it is a
 * per-lead button, not automatic. Results persist to Lead.meta.contacts. */
export async function findContacts(
  leadId: string
): Promise<{ ok: boolean; error?: string; contacts?: ProspectContact[] }> {
  const session = await requireManager();
  const lead = await db.lead.findUnique({ where: { id: leadId } });
  if (!lead) return { ok: false, error: "Lead not found" };
  const scope = locationScope(session);
  if (session.role !== "ADMIN" && scope.locationId && lead.locationId !== scope.locationId)
    return { ok: false, error: "Lead belongs to another location" };

  const apolloKey = process.env.APOLLO_API_KEY;
  if (!apolloKey) return { ok: false, error: "APOLLO_API_KEY is not configured yet (Vercel env) — ask the owner to add it" };
  const meta = (lead.meta ?? {}) as Record<string, unknown>;
  const domain = domainKey(typeof meta.website === "string" ? meta.website : null) || null;

  try {
    const { contacts } = await findDecisionMakers(
      { companyName: lead.companyName, domain },
      { apolloKey, rocketReachKey: process.env.ROCKETREACH_API_KEY }
    );
    if (contacts.length === 0) return { ok: false, error: "No decision-makers found in Apollo for this company" };
    await db.lead.update({
      where: { id: leadId },
      data: {
        meta: { ...meta, contacts },
        // Promote the best contact into the Lead's own fields when empty
        ...(lead.contactPerson ? {} : { contactPerson: `${contacts[0].name} (${contacts[0].title})` }),
        ...(lead.email || !contacts[0].email ? {} : { email: contacts[0].email }),
      },
    });
    revalidatePath("/prospecting");
    return { ok: true, contacts };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "contact lookup failed" };
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
  const contacts = Array.isArray(meta.contacts) ? (meta.contacts as ProspectContact[]) : [];
  try {
    const { draft } = await generateDraftService({
      companyName: lead.companyName,
      city: lead.city,
      state: lead.state,
      productLine: lead.productLine,
      enrichment: (lead.enrichment as Enrichment | null) ?? null,
      angle: typeof meta.angle === "string" ? meta.angle : null,
      senderCompany: lead.location?.shortTag === "TX" ? "Everflow Tire (Dallas, TX)" : "Rhino Tire USA (Orlando, FL)",
      contact: contacts[0] ? { name: contacts[0].name, title: contacts[0].title } : null,
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
