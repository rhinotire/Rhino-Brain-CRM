import "server-only";
import { db } from "@/lib/db";
import { subDays } from "date-fns";
import type { Prisma } from "@prisma/client";

export type AtRiskCustomer = {
  id: string;
  companyName: string;
  repName: string | null;
  last90: number;
  prior90: number;
  dropPct: number;      // how far last90 fell below prior90 (0-100)
  lastOrderAt: Date | null;
};

/**
 * Customers whose buying dropped sharply: last-90-day order total < 50% of the
 * prior 90 days, with a meaningful prior baseline. Needs imported order data.
 */
export async function findAtRiskCustomers(scope: Prisma.CustomerWhereInput, limit = 50): Promise<AtRiskCustomer[]> {
  const now = new Date();
  const d90 = subDays(now, 90);
  const d180 = subDays(now, 180);

  // only consider customers that have any orders in the last 180 days
  const recent = await db.order.findMany({
    where: { orderDate: { gte: d180 }, customer: scope },
    select: { customerId: true, orderDate: true, total: true, customer: { select: { id: true, companyName: true, assignedRep: { select: { name: true } } } } },
  });
  if (recent.length === 0) return [];

  const agg = new Map<string, { name: string; rep: string | null; last90: number; prior90: number; lastAt: Date | null }>();
  for (const o of recent) {
    const cid = o.customerId;
    const e = agg.get(cid) ?? { name: o.customer.companyName, rep: o.customer.assignedRep?.name ?? null, last90: 0, prior90: 0, lastAt: null };
    const amt = Number(o.total);
    if (o.orderDate >= d90) e.last90 += amt;
    else e.prior90 += amt;
    if (!e.lastAt || o.orderDate > e.lastAt) e.lastAt = o.orderDate;
    agg.set(cid, e);
  }

  const out: AtRiskCustomer[] = [];
  for (const [id, e] of agg) {
    if (e.prior90 < 500) continue;            // need a real baseline
    if (e.last90 >= e.prior90 * 0.5) continue; // not a sharp drop
    out.push({
      id, companyName: e.name, repName: e.rep,
      last90: e.last90, prior90: e.prior90,
      dropPct: Math.round((1 - e.last90 / e.prior90) * 100),
      lastOrderAt: e.lastAt,
    });
  }
  out.sort((a, b) => (b.prior90 - b.last90) - (a.prior90 - a.last90)); // biggest $ drop first
  return out.slice(0, limit);
}
