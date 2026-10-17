"use server";

import { revalidatePath } from "next/cache";
import {
  generateOutreachDraft as draftService,
  findDecisionMakers,
  domainKey,
  type OutreachDraft,
  type Enrichment,
  type ProspectContact,
} from "@rhino/services";
import { db } from "@/lib/db";
import { requireSession, type Session } from "@/lib/auth";

/**
 * Rep-facing actions for the My Work "Today's New Prospects" section — unlike
 * actions/prospecting.ts these don't require a manager. A rep may act on a
 * PROSPECTING lead that is in their company and unassigned or already theirs.
 */
async function repProspect(leadId: string) {
  const session: Session = await requireSession();
  const lead = await db.lead.findUnique({
    where: { id: leadId },
    include: { location: { select: { shortTag: true } } },
  });
  const mine = lead && (!lead.assignedRepId || lead.assignedRepId === session.userId);
  const sameCompany = lead && (session.role === "ADMIN" || !session.locationId || lead.locationId === session.locationId);
  return { session, lead: lead?.source === "PROSPECTING" && mine && sameCompany ? lead : null };
}

/** Take the prospect: it leaves everyone else's daily list and joins the rep's
 * "New Leads to Work". First click wins (atomic on assignedRepId null). */
export async function claimProspect(leadId: string): Promise<{ ok: boolean; error?: string }> {
  const { session, lead } = await repProspect(leadId);
  if (!lead) return { ok: false, error: "Prospect not available" };
  if (lead.assignedRepId === session.userId) return { ok: true };
  const { count } = await db.lead.updateMany({
    where: { id: leadId, assignedRepId: null },
    data: { assignedRepId: session.userId },
  });
  if (count !== 1) return { ok: false, error: "A teammate just claimed this one" };
  revalidatePath("/my-work");
  return { ok: true };
}

/** Dig up decision-makers (owner / purchaser / president) for a prospect via
 * Apollo (+RocketReach email fallback). Costs data credits, so it's a per-lead
 * button. Clears any cached opener so the next draft greets the named contact. */
export async function findProspectContacts(
  leadId: string
): Promise<{ ok: boolean; error?: string; contacts?: ProspectContact[] }> {
  const { lead } = await repProspect(leadId);
  if (!lead) return { ok: false, error: "Prospect not available" };
  const apolloKey = process.env.APOLLO_API_KEY;
  if (!apolloKey) return { ok: false, error: "APOLLO_API_KEY is not configured on the server" };
  const meta = (lead.meta ?? {}) as Record<string, unknown>;
  const domain = domainKey(typeof meta.website === "string" ? meta.website : null) || null;
  try {
    const { contacts } = await findDecisionMakers(
      { companyName: lead.companyName, domain },
      { apolloKey, rocketReachKey: process.env.ROCKETREACH_API_KEY }
    );
    if (contacts.length === 0) return { ok: false, error: "No decision-makers found for this company" };
    const { outreachDraft: _stale, ...rest } = meta;
    await db.lead.update({
      where: { id: leadId },
      data: {
        meta: { ...rest, contacts },
        ...(lead.contactPerson ? {} : { contactPerson: `${contacts[0].name} (${contacts[0].title})` }),
        ...(lead.email || !contacts[0].email ? {} : { email: contacts[0].email }),
      },
    });
    revalidatePath("/my-work");
    return { ok: true, contacts };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "contact lookup failed" };
  }
}

/** Cached-or-generate the AI opener (phone script + email draft) for a
 * prospect. Persisted into Lead.meta.outreachDraft so tokens are spent once. */
export async function getOpenerDraft(
  leadId: string
): Promise<{ ok: boolean; error?: string; draft?: OutreachDraft }> {
  const { lead } = await repProspect(leadId);
  if (!lead) return { ok: false, error: "Prospect not available" };
  const meta = (lead.meta ?? {}) as Record<string, unknown>;
  if (meta.outreachDraft && (meta.outreachDraft as OutreachDraft).phoneOpener) {
    return { ok: true, draft: meta.outreachDraft as OutreachDraft };
  }
  const contacts = Array.isArray(meta.contacts) ? (meta.contacts as ProspectContact[]) : [];
  try {
    const { draft } = await draftService({
      companyName: lead.companyName,
      city: lead.city,
      state: lead.state,
      productLine: lead.productLine,
      enrichment: (lead.enrichment as Enrichment | null) ?? null,
      angle: typeof meta.angle === "string" ? meta.angle : null,
      senderCompany: lead.location?.shortTag === "TX" ? "Everflow Tire (Dallas, TX)" : "Rhino Tire USA (Orlando, FL)",
      contact: contacts[0] ? { name: contacts[0].name, title: contacts[0].title } : null,
    });
    await db.lead.update({ where: { id: leadId }, data: { meta: { ...meta, outreachDraft: draft } } });
    return { ok: true, draft };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "draft generation failed" };
  }
}
