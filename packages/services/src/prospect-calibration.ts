/**
 * Rules for the /prospecting calibration queue (dealer-list activation spec
 * sections 7 and 8.1, final-review finding F2).
 *
 * Imports nothing, on purpose: this file is reachable from app code and must
 * stay free of Prisma / fs / xlsx (a value import of those from anything a
 * client component reaches passes the build and crashes production at runtime).
 */

/**
 * The queue is "AI-graded leads awaiting a human verdict", so a lead only
 * belongs in it once something has graded it, and the grade always sets `pool`.
 * Imported dealer-list rows arrive with no pool, score or enrichment (only the
 * ~443 enriched at --max-tier 2 ever get one), so they are not calibration
 * candidates until enrich-dealers grades them; gating on the grade rather than
 * on the import marker means an enriched dealer lead DOES appear here, and any
 * future importer is covered with no change. Legacy prospects that carry a pool
 * but no score stay in.
 *
 * Merge this into every query on the page that describes the pending queue.
 */
export const CALIBRATION_QUEUE_GATE = { pool: { not: null } } as const;

/**
 * Why a lead can never be assigned to a rep from the calibration page, or null
 * when it can. A lead with no locationId is parked on purpose (Canada, a state
 * neither company covers, an unresolved record): spec decision 8.1 is "orphans
 * get no rep assignment", because Rhino FL and Everflow TX share one database
 * and a rep assigned to an orphan would be working another company's market.
 *
 * Holds for every role including ADMIN, and is enforced where the assignment is
 * written (calibrateLead) as well as shown, so a later query edit that lets an
 * orphan into the list cannot re-expose it.
 */
export function repAssignBlockReason(lead: { locationId: string | null }): string | null {
  if (lead.locationId) return null;
  return "No company location: this lead is parked (Canada, non-home state or unresolved), so it cannot be assigned to a rep.";
}
