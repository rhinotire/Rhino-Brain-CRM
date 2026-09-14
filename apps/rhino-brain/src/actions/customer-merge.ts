"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, isManager, canWrite } from "@/lib/auth";
import type { ActionResult } from "./auth";
import type { Prisma } from "@prisma/client";

const norm = (s: string) => s.toLowerCase().replace(/\s*&\s*/g, "&").replace(/\s+/g, " ").trim();

/** Scalar fields worth preserving: keeper's value wins, losers fill the gaps. */
const FILL_FIELDS = [
  "contactPerson", "phone", "contactCell", "email", "website",
  "facebookUrl", "instagramUrl", "whatsapp",
  "address", "city", "state", "zip",
  "paymentTerms", "creditLimit", "notes", "assignedRepId",
] as const;

/**
 * Merge duplicate customer records: every related row (quotes, orders,
 * invoices, activities, tasks, documents, portal logins, installer links…)
 * moves to the keeper, missing contact fields are backfilled, then the
 * duplicates are deleted. Same company only; managers only.
 */
export async function mergeCustomers(keeperId: string, loserIds: string[]): Promise<ActionResult & { moved?: number }> {
  const session = await requireSession();
  if (!isManager(session)) return { ok: false, error: "Only managers can merge customers." };
  const ids = [...new Set(loserIds)].filter(id => id && id !== keeperId);
  if (!ids.length) return { ok: false, error: "Pick at least one duplicate to merge." };
  if (ids.length > 10) return { ok: false, error: "Merge at most 10 records at a time." };

  const keeper = await db.customer.findUnique({ where: { id: keeperId } });
  if (!keeper) return { ok: false, error: "Keeper record not found." };
  if (!canWrite(session, { locationId: keeper.locationId })) return { ok: false, error: "Not your company's customer." };

  const losers = await db.customer.findMany({ where: { id: { in: ids } } });
  if (losers.length !== ids.length) return { ok: false, error: "Some records no longer exist — refresh the page." };
  for (const l of losers) {
    if (l.locationId !== keeper.locationId) return { ok: false, error: "All records must belong to the same company." };
    if (norm(l.companyName) !== norm(keeper.companyName)) return { ok: false, error: "All records must have the same company name." };
  }

  // scalar backfill: first loser that has a value fills the keeper's gap
  const fill: Record<string, unknown> = {};
  for (const f of FILL_FIELDS) {
    if (keeper[f] == null || keeper[f] === "") {
      const donor = losers.find(l => l[f] != null && l[f] !== "");
      if (donor) fill[f] = donor[f];
    }
  }
  const tgDonor = !keeper.tireguruId ? losers.find(l => l.tireguruId) : null;
  const lastContactAt = [keeper.lastContactAt, ...losers.map(l => l.lastContactAt)]
    .filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

  let moved = 0;
  await db.$transaction(async tx => {
    for (const l of losers) {
      const where = { customerId: l.id };
      const to = { customerId: keeperId };
      const results = await Promise.all([
        tx.activity.updateMany({ where, data: to }),
        tx.task.updateMany({ where, data: to }),
        tx.quote.updateMany({ where, data: to }),
        tx.opportunity.updateMany({ where, data: to }),
        tx.customerDocument.updateMany({ where, data: to }),
        tx.order.updateMany({ where, data: to }),
        tx.invoice.updateMany({ where, data: to }),
        tx.lostSale.updateMany({ where, data: to }),
        tx.installer.updateMany({ where, data: to }),
        tx.dealerUser.updateMany({ where, data: to }),
        tx.dealerOrderRequest.updateMany({ where, data: to }),
        tx.lead.updateMany({ where: { convertedCustomerId: l.id }, data: { convertedCustomerId: keeperId } }),
        tx.installerReferral.updateMany({ where: { matchedCustomerId: l.id }, data: { matchedCustomerId: keeperId } }),
      ]);
      moved += results.reduce((s, r) => s + r.count, 0);
      // tags: composite PK — copy without duplicating, then the cascade delete clears the rest
      const tags = await tx.customerTag.findMany({ where: { customerId: l.id }, select: { tagId: true } });
      if (tags.length) {
        await tx.customerTag.createMany({
          data: tags.map(t => ({ customerId: keeperId, tagId: t.tagId })),
          skipDuplicates: true,
        });
      }
      // tireguruId is unique — release it before the keeper takes it
      if (tgDonor?.id === l.id) await tx.customer.update({ where: { id: l.id }, data: { tireguruId: null } });
    }
    await tx.customer.deleteMany({ where: { id: { in: ids } } });
    await tx.customer.update({
      where: { id: keeperId },
      data: { ...(fill as Prisma.CustomerUncheckedUpdateInput), ...(tgDonor ? { tireguruId: tgDonor.tireguruId } : {}), ...(lastContactAt ? { lastContactAt } : {}) },
    });
    await tx.activity.create({
      data: {
        type: "INTERNAL_NOTE",
        subject: `Merged ${ids.length} duplicate record${ids.length > 1 ? "s" : ""}`,
        notes: `Duplicates of "${keeper.companyName}" merged by ${session.name}; ${moved} related records moved.`,
        customerId: keeperId, repId: session.userId, locationId: keeper.locationId, meaningful: false,
      },
    });
  }, { timeout: 20000 });

  revalidatePath("/customers");
  revalidatePath("/customers/duplicates");
  revalidatePath(`/customers/${keeperId}`);
  return { ok: true, moved };
}

const EMPTY_COUNTS = [
  "activities", "tasks", "quotes", "opportunities", "tags", "leads", "documents",
  "orders", "invoices", "lostSales", "installers", "installerReferrals", "dealerUsers", "dealerOrderRequests",
] as const;

/**
 * Auto-clean: inside every duplicate group, delete records that have NO
 * related data at all (clones from repeated imports). One record always
 * survives per group; contact fields from deleted clones backfill it.
 */
export async function cleanEmptyDuplicates(): Promise<ActionResult & { deleted?: number; groups?: number }> {
  const session = await requireSession();
  if (!isManager(session)) return { ok: false, error: "Only managers can clean duplicates." };

  const custs = await db.customer.findMany({
    select: {
      id: true, companyName: true, locationId: true, createdAt: true,
      contactPerson: true, phone: true, contactCell: true, email: true, tireguruId: true,
      _count: {
        select: {
          activities: true, tasks: true, quotes: true, opportunities: true, tags: true, leads: true,
          documents: true, orders: true, invoices: true, lostSales: true, installers: true,
          installerReferrals: true, dealerUsers: true, dealerOrderRequests: true,
        },
      },
    },
  });
  const groups = new Map<string, typeof custs>();
  for (const c of custs) {
    // only within the caller's write scope
    if (!canWrite(session, { locationId: c.locationId })) continue;
    const k = (c.locationId ?? "none") + "|" + norm(c.companyName);
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(c);
  }

  let deleted = 0, touchedGroups = 0;
  for (const g of [...groups.values()].filter(g => g.length > 1)) {
    const isEmpty = (c: (typeof g)[number]) => EMPTY_COUNTS.every(k => c._count[k] === 0);
    const withData = g.filter(c => !isEmpty(c));
    // keeper: record with data, else the oldest — one always survives
    const keeper = (withData[0] ?? [...g].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0]);
    const removable = g.filter(c => c.id !== keeper.id && isEmpty(c));
    if (!removable.length) continue;

    const fill: Record<string, unknown> = {};
    for (const f of ["contactPerson", "phone", "contactCell", "email"] as const) {
      if (!keeper[f]) { const d = removable.find(c => c[f]); if (d) fill[f] = d[f]; }
    }
    if (!keeper.tireguruId) {
      const d = removable.find(c => c.tireguruId);
      if (d) { await db.customer.update({ where: { id: d.id }, data: { tireguruId: null } }); fill.tireguruId = d.tireguruId; }
    }
    await db.customer.deleteMany({ where: { id: { in: removable.map(c => c.id) } } });
    if (Object.keys(fill).length) await db.customer.update({ where: { id: keeper.id }, data: fill as Prisma.CustomerUncheckedUpdateInput });
    deleted += removable.length;
    touchedGroups++;
  }

  revalidatePath("/customers");
  revalidatePath("/customers/duplicates");
  return { ok: true, deleted, groups: touchedGroups };
}
