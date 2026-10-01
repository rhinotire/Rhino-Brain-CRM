"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, isAccounting, isManager, repScope, locationScope, defaultLocationId } from "@/lib/auth";
import { optimizeStopOrder } from "@rhino/services";

export type FieldSearchHit = {
  id: string;
  name: string;
  contact: string | null;
  phone: string | null;
  address: string | null;
  zip: string | null;
  tier: string;
  owed: number;
  daysSinceOrder: number | null;
  openQuotes: number;
};

/** Shortest-drive stop order from the rep's position (ZIP-centroid 2-opt). */
export async function optimizeRoute(
  stops: { id: string; zip: string | null }[],
  start?: { lat: number; lng: number } | null,
): Promise<{ orderedIds: string[]; totalMiles: number | null }> {
  await requireSession();
  const clean = stops.slice(0, 12).map(s => ({ id: String(s.id), zip: s.zip ? String(s.zip).slice(0, 5) : null }));
  return optimizeStopOrder(clean, start ?? null);
}

/** Search my customers to add a stop to today's route (Field Mode). */
export async function searchFieldCustomers(query: string): Promise<FieldSearchHit[]> {
  const session = await requireSession();
  const q = query.trim();
  if (q.length < 2) return [];
  const now = new Date();
  const rows = await db.customer.findMany({
    where: {
      ...repScope(session),
      ...locationScope(session),
      OR: [
        { companyName: { contains: q, mode: "insensitive" } },
        { city: { contains: q, mode: "insensitive" } },
        { phone: { contains: q } },
        { address: { contains: q, mode: "insensitive" } },
      ],
    },
    include: {
      invoices: { where: { balance: { gt: 0 }, dueDate: { lt: now } }, select: { balance: true } },
      orders: { orderBy: { orderDate: "desc" }, take: 1, select: { orderDate: true } },
      quotes: { where: { status: { in: ["DRAFT", "SENT", "FOLLOW_UP_NEEDED"] } }, select: { id: true }, take: 5 },
    },
    orderBy: { updatedAt: "desc" },
    take: 8,
  });
  return rows.map(c => ({
    id: c.id,
    name: c.companyName,
    contact: c.contactPerson,
    phone: c.contactCell || c.phone,
    address: [c.address, c.city, c.state, c.zip].filter(Boolean).join(", ") || null,
    zip: c.zip?.trim().slice(0, 5) || null,
    tier: c.tier,
    owed: c.invoices.reduce((s, i) => s + Number(i.balance), 0),
    daysSinceOrder: c.orders[0] ? Math.floor((now.getTime() - c.orders[0].orderDate.getTime()) / 86400000) : null,
    openQuotes: c.quotes.length,
  }));
}

/**
 * Drive-by prospect: the rep is standing in front of a new store. Creates the
 * customer (PROSPECT, assigned to the rep) and logs the first visit — with the
 * GPS check-in — in one shot.
 */
export async function createFieldProspect(input: {
  name: string; phone?: string; city?: string; notes?: string; visitLocation?: string;
}): Promise<{ ok: boolean; error?: string; customerId?: string }> {
  const session = await requireSession();
  if (isAccounting(session)) return { ok: false, error: "Accounting is read-only." };
  const name = input.name.trim().slice(0, 120);
  if (name.length < 2) return { ok: false, error: "Enter the store name." };

  const locationId = defaultLocationId(session, null);
  if (!locationId) return { ok: false, error: "Select a company in the sidebar first." };

  // avoid an accidental duplicate of an existing account
  const dup = await db.customer.findFirst({
    where: { locationId, companyName: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  if (dup) return { ok: false, error: "A customer with this exact name already exists — search and add it instead." };

  const visitLoc = (input.visitLocation ?? "").trim().slice(0, 200);
  const customer = await db.customer.create({
    data: {
      companyName: name,
      phone: input.phone?.trim().slice(0, 30) || undefined,
      city: input.city?.trim().slice(0, 60) || undefined,
      status: "PROSPECT",
      source: "COLD_CALL",
      assignedRepId: isManager(session) ? null : session.userId,
      locationId,
      lastContactAt: new Date(),
    },
  });
  await db.activity.create({
    data: {
      type: "VISIT",
      subject: "New prospect visit (drive-by)",
      notes: [input.notes?.trim().slice(0, 500), visitLoc ? `📍 On-site check-in: ${visitLoc}` : null].filter(Boolean).join("\n") || undefined,
      customerId: customer.id,
      repId: session.userId,
      locationId,
      meaningful: true,
    },
  });
  revalidatePath("/field");
  revalidatePath("/customers");
  return { ok: true, customerId: customer.id };
}
