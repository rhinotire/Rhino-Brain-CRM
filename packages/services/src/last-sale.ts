/**
 * `Customer.lastSaleAt` — the sale evidence that protects an account from returning to the 公海
 * pool (spec 2026-10-26-customer-pool-design.md section 6.4).
 *
 * WHY INVOICES: most sales go through TireGuru at the counter and never reach the CRM as a logged
 * activity, so a rep whose customer buys every week would lose that account on the 90-day rule.
 * The `/api/churn` feed carries a lastSale date but posts only the AT-RISK list, so using it alone
 * would protect exactly the wrong customers. `Invoice`, imported by the A/R sync, covers everyone
 * who buys.
 *
 * `Invoice.dueDate` is the sale date plus payment terms rather than the sale date itself. That errs
 * toward protecting an account, which is the safe direction.
 *
 * THIS MODULE OWNS `lastSaleAt` AND RECOMPUTES IT WHOLESALE. If another source ever starts writing
 * the field (the churn feed is the likely candidate), these statements must become a MAX of both
 * sources, or that source's value is erased on the next A/R import.
 *
 * Imports nothing, on purpose: it is reachable from app code and must stay free of Prisma / fs /
 * xlsx. The caller passes its own client in.
 */

/** Set lastSaleAt to the newest invoice due date, for every customer that has one. */
export const SET_FROM_INVOICES_SQL = `
UPDATE "Customer" c
   SET "lastSaleAt" = sub.max_due
  FROM (SELECT "customerId", MAX("dueDate") AS max_due
          FROM "Invoice" WHERE "customerId" IS NOT NULL
         GROUP BY "customerId") sub
 WHERE c.id = sub."customerId"
   AND c."lastSaleAt" IS DISTINCT FROM sub.max_due`;

/**
 * Clear it for customers with no invoice left. The A/R import is a snapshot replace, so a customer
 * really can stop having invoices, and a stale date would protect a dead account.
 */
export const CLEAR_WITHOUT_INVOICES_SQL = `
UPDATE "Customer"
   SET "lastSaleAt" = NULL
 WHERE "lastSaleAt" IS NOT NULL
   AND id NOT IN (SELECT "customerId" FROM "Invoice" WHERE "customerId" IS NOT NULL)`;

/** The one method this needs from a Prisma client, structurally typed so nothing is imported. */
export type RawExecutor = { $executeRawUnsafe: (sql: string) => Promise<number> };

/** Recompute lastSaleAt from Invoice. Returns how many customer rows each statement changed. */
export async function refreshLastSale(db: RawExecutor): Promise<{ set: number; cleared: number }> {
  const set = await db.$executeRawUnsafe(SET_FROM_INVOICES_SQL);
  const cleared = await db.$executeRawUnsafe(CLEAR_WITHOUT_INVOICES_SQL);
  return { set, cleared };
}
