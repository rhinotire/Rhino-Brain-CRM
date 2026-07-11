"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, isManager, defaultLocationId } from "@/lib/auth";
import { quoteSchema, opportunitySchema, userSchema } from "@/lib/validations";
import type { ActionResult } from "./auth";
import type { QuoteStatus, OpportunityStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

// ---------- Quotes ----------

async function nextQuoteNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await db.quote.count({ where: { quoteNumber: { startsWith: `Q${year}-` } } });
  return `Q${year}-${String(count + 1).padStart(4, "0")}`;
}

/** Create quote from a JSON payload (client builds the line-item array). */
export async function createQuote(payload: unknown): Promise<ActionResult & { quoteId?: string }> {
  const session = await requireSession();
  const parsed = quoteSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0].message };

  const d = parsed.data;
  const items = d.items.map(i => ({ ...i, lineTotal: i.quantity * i.unitPrice }));
  const total = items.reduce((s, i) => s + i.lineTotal, 0);

  const quoteCust = await db.customer.findUnique({ where: { id: d.customerId }, select: { locationId: true } });
  const quote = await db.quote.create({
    data: {
      locationId: quoteCust?.locationId ?? defaultLocationId(session, null),
      quoteNumber: await nextQuoteNumber(),
      customerId: d.customerId,
      repId: session.userId,
      expirationDate: d.expirationDate,
      competitorPrice: d.competitorPrice,
      competitorBrand: d.competitorBrand,
      nextFollowUpAt: d.nextFollowUpAt,
      notes: d.notes,
      total,
      items: { create: items },
    },
  });
  revalidatePath("/quotes");
  return { ok: true, quoteId: quote.id };
}

export async function setQuoteStatus(quoteId: string, status: QuoteStatus): Promise<ActionResult> {
  const session = await requireSession();
  const quote = await db.quote.findUnique({ where: { id: quoteId } });
  if (!quote) return { ok: false, error: "Quote not found." };
  if (!isManager(session) && quote.repId !== session.userId) return { ok: false, error: "Not your quote." };

  await db.quote.update({
    where: { id: quoteId },
    data: {
      status,
      ...(status === "SENT" && !quote.sentAt ? { sentAt: new Date() } : {}),
      ...(status === "ACCEPTED" || status === "REJECTED" ? { decidedAt: new Date() } : {}),
    },
  });

  // Sending a quote also logs a QUOTE activity + bumps customer last contact
  if (status === "SENT" && !quote.sentAt) {
    await db.activity.create({
      data: {
        type: "QUOTE",
        subject: `Quote ${quote.quoteNumber} sent`,
        customerId: quote.customerId,
        repId: session.userId,
        quoteId: quote.id,
        meaningful: true,
      },
    });
    await db.customer.update({ where: { id: quote.customerId }, data: { lastContactAt: new Date() } });
  }
  revalidatePath("/quotes");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function setQuoteFollowUp(quoteId: string, date: string): Promise<ActionResult> {
  await requireSession();
  await db.quote.update({ where: { id: quoteId }, data: { nextFollowUpAt: new Date(date) } });
  revalidatePath("/quotes");
  return { ok: true };
}

// ---------- Opportunities ----------

export async function createOpportunity(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const session = await requireSession();
  const parsed = opportunitySchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0].message };
  const oppCust = await db.customer.findUnique({ where: { id: parsed.data.customerId }, select: { locationId: true } });
  await db.opportunity.create({ data: { ...parsed.data, repId: session.userId, locationId: oppCust?.locationId ?? defaultLocationId(session, null) } });
  revalidatePath("/opportunities");
  return { ok: true };
}

export async function setOpportunityStatus(id: string, status: OpportunityStatus): Promise<ActionResult> {
  await requireSession();
  await db.opportunity.update({ where: { id }, data: { status } });
  revalidatePath("/opportunities");
  return { ok: true };
}

// ---------- Users (settings) ----------

export async function upsertUser(userId: string | null, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const session = await requireSession();
  if (session.role !== "ADMIN") return { ok: false, error: "Only the admin can manage users." };

  const parsed = userSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0].message };
  const d = parsed.data;
  // reps this user assists (also sees their customers) — excludes self
  const assistIds = formData.getAll("assists").map(String).filter(id => id && id !== userId);

  if (userId) {
    await db.user.update({
      where: { id: userId },
      data: {
        name: d.name,
        email: d.email.toLowerCase(),
        role: d.role,
        locationId: d.role === "ADMIN" ? null : d.locationId || null,
        assists: { set: assistIds.map(id => ({ id })) },
        ...(d.password ? { passwordHash: await bcrypt.hash(d.password, 10) } : {}),
      },
    });
  } else {
    if (!d.password) return { ok: false, error: "Password is required for new users." };
    await db.user.create({
      data: {
        name: d.name, email: d.email.toLowerCase(), role: d.role,
        locationId: d.role === "ADMIN" ? null : d.locationId || null,
        passwordHash: await bcrypt.hash(d.password, 10),
        assists: { connect: assistIds.map(id => ({ id })) },
      },
    });
  }
  revalidatePath("/settings/users");
  return { ok: true };
}

export async function toggleUserActive(userId: string): Promise<ActionResult> {
  const session = await requireSession();
  if (session.role !== "ADMIN") return { ok: false, error: "Only the admin can manage users." };
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return { ok: false, error: "User not found." };
  await db.user.update({ where: { id: userId }, data: { active: !user.active } });
  revalidatePath("/settings/users");
  return { ok: true };
}

// ---------- Notifications ----------

export async function markNotificationsRead(): Promise<ActionResult> {
  const session = await requireSession();
  await db.notification.updateMany({ where: { userId: session.userId, read: false }, data: { read: true } });
  revalidatePath("/", "layout");
  return { ok: true };
}


// ---------- Locations (v2) ----------

export async function upsertLocation(locationId: string | null, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const session = await requireSession();
  if (session.role !== "ADMIN") return { ok: false, error: "Only the admin can manage locations." };
  const name = String(formData.get("name") || "").trim();
  const city = String(formData.get("city") || "").trim();
  const shortTag = String(formData.get("shortTag") || "").trim() || name.slice(0, 2).toUpperCase();
  const color = String(formData.get("color") || "").trim() || "#e8590c";
  if (!name) return { ok: false, error: "Business name is required." };
  try {
    if (locationId) await db.location.update({ where: { id: locationId }, data: { name, city: city || null, shortTag, color } });
    else await db.location.create({ data: { name, city: city || null, shortTag, color } });
  } catch {
    return { ok: false, error: "A location with that name already exists." };
  }
  revalidatePath("/settings/users");
  revalidatePath("/", "layout");
  return { ok: true };
}
