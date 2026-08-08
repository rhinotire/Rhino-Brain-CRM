"use server";

import { revalidatePath } from "next/cache";
import { subDays } from "date-fns";
import { db } from "@/lib/db";
import { requireSession, defaultLocationId } from "@/lib/auth";
import { activitySchema } from "@/lib/validations";
import { computeCustomerScore, outcomeLabels } from "@/lib/domain";
import type { ActionResult } from "./auth";

const CONTACT_TYPES = ["CALL","EMAIL","TEXT","WHATSAPP","QUOTE","ORDER","PAYMENT","VISIT","COMPLAINT"] as const;
const MEANINGFUL_TYPES = ["CALL","EMAIL","TEXT","WHATSAPP","QUOTE","ORDER","VISIT"] as const;

export async function logActivity(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const session = await requireSession();
  const raw = Object.fromEntries(formData.entries());
  const parsed = activitySchema.safeParse({
    ...raw,
    meaningful: raw.meaningful === "on" || raw.meaningful === "true",
    followUpRequired: raw.followUpRequired === "on" || raw.followUpRequired === "true",
  });
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0].message };

  const d = parsed.data;
  const isContact = (CONTACT_TYPES as readonly string[]).includes(d.type);
  const meaningful = d.meaningful || (MEANINGFUL_TYPES as readonly string[]).includes(d.type);

  // Location follows the linked account; falls back to the caller's location
  let locId: string | null = null;
  if (d.customerId) locId = (await db.customer.findUnique({ where: { id: d.customerId }, select: { locationId: true } }))?.locationId ?? null;
  else if (d.leadId) locId = (await db.lead.findUnique({ where: { id: d.leadId }, select: { locationId: true } }))?.locationId ?? null;
  if (!locId) locId = defaultLocationId(session, null);


  const activity = await db.activity.create({
    data: {
      locationId: locId,
      type: d.type,
      subject: d.subject,
      notes: d.notes,
      outcome: d.outcome ? outcomeLabels[d.outcome] ?? d.outcome : undefined,
      meaningful,
      followUpRequired: d.followUpRequired,
      nextFollowUpAt: d.nextFollowUpAt,
      customerId: d.customerId || null,
      leadId: d.leadId || null,
      quoteId: d.quoteId || null,
      repId: session.userId,
    },
  });

  // Lost-sale outcomes also create a LostSale record (restock / pricing intel)
  if (d.outcome?.startsWith("LOST")) {
    let accountName = "";
    if (d.customerId) accountName = (await db.customer.findUnique({ where: { id: d.customerId }, select: { companyName: true } }))?.companyName ?? "";
    else if (d.leadId) accountName = (await db.lead.findUnique({ where: { id: d.leadId }, select: { companyName: true } }))?.companyName ?? "";
    await db.lostSale.create({
      data: {
        reason: d.outcome === "LOST_NO_STOCK" ? "NO_STOCK" : d.outcome === "LOST_PRICE" ? "PRICE" : "OTHER",
        item: d.lostItem || "(unspecified)",
        quantity: d.lostQty ?? 0,
        estValue: d.lostValue ?? 0,
        competitor: d.lostCompetitor,
        competitorPrice: d.lostCompetitorPrice,
        notes: d.notes,
        customerName: accountName,
        customerId: d.customerId || null,
        repId: session.userId,
        locationId: locId,
      },
    });
    revalidatePath("/lost-sales");
  }

  // Keep customer maintenance fields + score in sync
  if (d.customerId && isContact) {
    const customer = await db.customer.findUnique({
      where: { id: d.customerId },
      include: {
        _count: { select: { activities: { where: { occurredAt: { gte: subDays(new Date(), 90) } } } } },
        quotes: { where: { status: "ACCEPTED" }, select: { id: true } },
      },
    });
    if (customer) {
      const lastContactAt = new Date();
      await db.customer.update({
        where: { id: d.customerId },
        data: {
          lastContactAt,
          nextFollowUpAt: d.nextFollowUpAt ?? customer.nextFollowUpAt,
          score: computeCustomerScore({
            tier: customer.tier,
            lastContactAt,
            activityCount90d: customer._count.activities + 1,
            acceptedQuotes: customer.quotes.length,
          }),
        },
      });
    }
  }
  if (d.leadId) {
    await db.lead.update({
      where: { id: d.leadId },
      data: {
        lastActivityAt: new Date(),
        nextFollowUpAt: d.nextFollowUpAt ?? undefined,
        // Any first activity moves NEW_LEAD → CONTACTED automatically
        ...(isContact ? {} : {}),
      },
    });
    const lead = await db.lead.findUnique({ where: { id: d.leadId } });
    if (lead?.stage === "NEW_LEAD" && isContact) {
      await db.lead.update({ where: { id: d.leadId }, data: { stage: "CONTACTED" } });
    }
  }
  // Following up on a quote resets its 3-day follow-up clock — but ONLY for a quote
  // that is still SENT and belongs to this same customer. updateMany won't throw on
  // no match and won't touch ACCEPTED/REJECTED/DRAFT quotes (no more "resurrecting" won deals).
  if (d.quoteId) {
    await db.quote.updateMany({
      where: { id: d.quoteId, status: "SENT", ...(d.customerId ? { customerId: d.customerId } : {}) },
      data: { lastFollowUpAt: new Date(), nextFollowUpAt: d.nextFollowUpAt ?? undefined },
    });
  }

  revalidatePath("/my-work");
  revalidatePath("/activities");
  if (d.customerId) revalidatePath(`/customers/${d.customerId}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function setCustomerFollowUp(customerId: string, date: string): Promise<ActionResult> {
  await requireSession();
  await db.customer.update({ where: { id: customerId }, data: { nextFollowUpAt: new Date(date) } });
  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/my-work");
  return { ok: true };
}
