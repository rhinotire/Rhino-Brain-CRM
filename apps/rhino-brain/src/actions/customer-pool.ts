"use server";

import { revalidatePath } from "next/cache";
import {
  claimCapError,
  decidePool,
  isClaimable,
  repAssignmentError,
  CLAIM_CAP_PER_7_DAYS,
  type PoolCustomer,
} from "@rhino/services";
import { db } from "@/lib/db";
import { requireSession, requireManager, type Session } from "@/lib/auth";

/**
 * 公海客户 — taking a customer out of the shared pool, and pinning one out of it.
 *
 * The pool is the ABSENCE of `assignedRepId`, never a stored flag, so claiming is a single atomic
 * update guarded on it still being null: first click wins, same as `claimProspect` in
 * actions/my-prospects.ts. Every decision about eligibility comes from `decidePool` in services —
 * nothing is re-derived here, so the claim path and the nightly sweep cannot disagree.
 *
 * Spec: docs/superpowers/specs/2026-10-26-customer-pool-design.md
 */

const SELECT = {
  id: true,
  companyName: true,
  assignedRepId: true,
  locationId: true,
  status: true,
  poolExempt: true,
  assignedAt: true,
  lastContactAt: true,
  lastSaleAt: true,
  poolWarnedAt: true,
  nextFollowUpAt: true,
  assignedRep: { select: { role: true, active: true } },
} as const;

type Row = {
  id: string;
  companyName: string;
  assignedRepId: string | null;
  locationId: string | null;
  status: string;
  poolExempt: boolean;
  assignedAt: Date | null;
  lastContactAt: Date | null;
  lastSaleAt: Date | null;
  poolWarnedAt: Date | null;
  nextFollowUpAt: Date | null;
  assignedRep: { role: string; active: boolean } | null;
};

/**
 * `protectingQuote` is false here on purpose: a quote in flight protects a customer somebody
 * ALREADY holds from being recycled. It has no bearing on whether an unassigned customer can be
 * claimed, and `decidePool` never consults it on the unassigned branch.
 */
function toPoolCustomer(c: Row): PoolCustomer {
  return {
    id: c.id,
    assignedRepId: c.assignedRepId,
    locationId: c.locationId,
    status: c.status,
    poolExempt: c.poolExempt,
    assignedAt: c.assignedAt,
    lastContactAt: c.lastContactAt,
    lastSaleAt: c.lastSaleAt,
    poolWarnedAt: c.poolWarnedAt,
    nextFollowUpAt: c.nextFollowUpAt,
    repRole: c.assignedRep?.role ?? null,
    repActive: c.assignedRep?.active ?? null,
    protectingQuote: false,
  };
}

/** Rhino FL and Everflow TX share one database; a scoped user never reaches the other company. */
function sameCompany(session: Session, locationId: string | null): boolean {
  if (!session.locationId) return true; // ADMIN, or a user with no location of their own
  return locationId === session.locationId;
}

/**
 * Take a customer out of the pool. First click wins; the loser is told so rather than seeing a
 * generic failure, because two reps racing for the same account is a normal event, not an error.
 */
export async function claimCustomer(customerId: string): Promise<{ ok: boolean; error?: string }> {
  const session = await requireSession();

  const row = (await db.customer.findUnique({ where: { id: customerId }, select: SELECT })) as Row | null;
  if (!row) return { ok: false, error: "Customer not found" };
  if (!sameCompany(session, row.locationId)) return { ok: false, error: "That customer belongs to another company" };

  if (row.assignedRepId === session.userId) return { ok: true }; // already theirs — nothing to do
  if (!isClaimable(toPoolCustomer(row))) {
    const why = decidePool(toPoolCustomer(row), new Date());
    return { ok: false, error: row.assignedRepId ? "Another rep already has this customer" : `Not available: ${why.reason}` };
  }

  // Spec section 8.1 / the leads rule: never put a rep on a customer with no company location.
  const blocked = repAssignmentError(row, session.userId);
  if (blocked) return { ok: false, error: blocked };

  const since = new Date(Date.now() - 7 * 86_400_000);
  const claimsThisWeek = await db.poolEvent.count({
    where: { repId: session.userId, kind: "CLAIM", at: { gte: since } },
  });
  const capped = claimCapError(claimsThisWeek, session.role);
  if (capped) return { ok: false, error: capped };

  // Atomic: the guard on assignedRepId being null is what makes first-click-wins true.
  const { count } = await db.customer.updateMany({
    where: { id: customerId, assignedRepId: null },
    data: { assignedRepId: session.userId, assignedAt: new Date(), poolWarnedAt: null },
  });
  if (count !== 1) return { ok: false, error: "A teammate just claimed this one" };

  await db.$transaction([
    db.poolEvent.create({
      data: { customerId, repId: session.userId, kind: "CLAIM", reason: `Claimed from the pool (${claimsThisWeek + 1} of ${CLAIM_CAP_PER_7_DAYS} this week)` },
    }),
    db.activity.create({
      data: {
        type: "INTERNAL_NOTE",
        subject: "Claimed from the 公海 pool",
        notes: `${session.name} took this customer out of the pool.`,
        customerId,
        repId: session.userId,
        locationId: row.locationId,
      },
    }),
  ]);

  revalidatePath("/customers");
  revalidatePath("/customers/pool");
  revalidatePath("/my-work");
  return { ok: true };
}

/**
 * Pin a customer out of the pool, or release the pin. A pinned account never recycles and never
 * appears in the pool — it is the owner's override for a key account.
 */
export async function setPoolExempt(customerId: string, exempt: boolean): Promise<{ ok: boolean; error?: string }> {
  const session = await requireManager();

  const row = await db.customer.findUnique({ where: { id: customerId }, select: { id: true, locationId: true, poolExempt: true } });
  if (!row) return { ok: false, error: "Customer not found" };
  if (!sameCompany(session, row.locationId)) return { ok: false, error: "That customer belongs to another company" };
  if (row.poolExempt === exempt) return { ok: true };

  await db.$transaction([
    db.customer.update({ where: { id: customerId }, data: { poolExempt: exempt } }),
    db.poolEvent.create({
      data: {
        customerId,
        repId: session.userId,
        kind: exempt ? "EXEMPT" : "UNEXEMPT",
        reason: exempt ? "Pinned as a key account — never returns to the pool" : "Pin removed — the 90-day rule applies again",
      },
    }),
  ]);

  revalidatePath("/customers");
  revalidatePath("/customers/pool");
  return { ok: true };
}
