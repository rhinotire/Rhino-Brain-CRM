/**
 * 公海客户 (customer pool) — every decision about who owns a customer.
 *
 * The pool is the ABSENCE of `assignedRepId`, never a stored flag, so it cannot drift
 * out of sync with reality. An account returns to the pool when 90 days have passed with
 * no contact, no sale and no fresh assignment — and only after the rep was actually warned
 * for 15 days, because a clock alone would let the first sweep take accounts that were
 * never shown as at-risk.
 *
 * Imports nothing, on purpose: this file is reachable from app code and must stay free of
 * Prisma / fs / xlsx (a value import of those from anything a client component reaches
 * passes the build and crashes production at runtime). Callers pass plain values in.
 *
 * Spec: docs/superpowers/specs/2026-10-26-customer-pool-design.md
 */

export const RECYCLE_AFTER_DAYS = 90;
export const WARN_AFTER_DAYS = 75;
export const MIN_WARNING_DAYS = 15;
export const CLAIM_CAP_PER_7_DAYS = 10;
/** A follow-up further out than this cannot hold an account: otherwise a date in 2030 holds it forever. */
export const FOLLOW_UP_PROTECTION_MAX_DAYS = 30;
/** A sent quote with no expiry date protects only while it is this recent, for the same reason. */
export const QUOTE_RECENT_DAYS = 30;
/** A won deal means an active account, for this long after it was accepted. */
export const ACCEPTED_QUOTE_PROTECTION_DAYS = 90;

const DAY_MS = 86_400_000;

/** Statuses that are not in the pool whoever holds them: never hand these to whoever clicks first. */
const UNPOOLABLE_STATUSES = ["LOST", "DO_NOT_CONTACT"];
/** A quote in negotiation. DRAFT was never sent; REJECTED and EXPIRED are dead. */
const LIVE_QUOTE_STATUSES = ["SENT", "FOLLOW_UP_NEEDED"];

export type PoolCustomer = {
  id: string;
  assignedRepId: string | null;
  locationId: string | null;
  status: string;
  poolExempt: boolean;
  assignedAt: Date | null;
  lastContactAt: Date | null;
  lastSaleAt: Date | null;
  poolWarnedAt: Date | null;
  nextFollowUpAt: Date | null;
  /** The holder's role and active flag; both null when nobody holds it. */
  repRole: string | null;
  repActive: boolean | null;
  /** Result of `hasProtectingQuote` — computed by the caller from the customer's quote rows. */
  protectingQuote: boolean;
};

export type PoolState =
  /** Not in the pool and not claimable, whoever holds it. */
  | "NOT_POOLABLE"
  /** Unassigned and claimable. */
  | "IN_POOL"
  /** Held, and the clock is not close to running out. */
  | "HELD_OK"
  /** Held, inside the warning window. */
  | "HELD_WARNING"
  /** Held, and due to return to the pool now. */
  | "HELD_RECYCLE";

export type PoolDecision = {
  state: PoolState;
  /** A short human sentence, for the audit trail and the rep-facing countdown. */
  reason: string;
  /** The date the 90 days are counted from, or null when nothing dates the account. */
  clockFrom: Date | null;
  /** When it is due to return to the pool, or null when the clock does not govern. */
  dueAt: Date | null;
  /** Whole days until `dueAt`, or null alongside it. */
  daysLeft: number | null;
};

/** The quote fields that decide whether a deal in flight protects an account. */
export type ProtectingQuote = {
  status: string;
  expirationDate: Date | null;
  quoteDate: Date | null;
  /** When it was ACCEPTED or REJECTED (`Quote.decidedAt`). */
  decidedAt: Date | null;
};

const wholeDaysBetween = (from: Date, to: Date) => Math.floor((to.getTime() - from.getTime()) / DAY_MS);

const latest = (...dates: (Date | null)[]): Date | null =>
  dates.reduce<Date | null>((best, d) => (d && (!best || d > best) ? d : best), null);

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Does any quote on this customer represent a deal in flight?
 *
 * Lives here rather than in each caller so the claim path and the sweep cannot disagree —
 * a divergence would be invisible, with one protecting an account the other recycles.
 */
export function hasProtectingQuote(quotes: readonly ProtectingQuote[], now: Date): boolean {
  return quotes.some(q => {
    if (q.status === "ACCEPTED") {
      return q.decidedAt !== null && wholeDaysBetween(q.decidedAt, now) <= ACCEPTED_QUOTE_PROTECTION_DAYS;
    }
    if (!LIVE_QUOTE_STATUSES.includes(q.status)) return false;
    if (q.expirationDate !== null) return q.expirationDate > now;
    return q.quoteDate !== null && wholeDaysBetween(q.quoteDate, now) <= QUOTE_RECENT_DAYS;
  });
}

/** Where this customer stands with respect to the pool. Pure: same inputs, same answer. */
export function decidePool(c: PoolCustomer, now: Date): PoolDecision {
  const bare = { clockFrom: null, dueAt: null, daysLeft: null };

  // --- Never in the pool, whoever holds it ---
  if (c.poolExempt) return { state: c.assignedRepId ? "HELD_OK" : "NOT_POOLABLE", reason: "pinned as a key account", ...bare };
  if (c.locationId === null) {
    return { state: c.assignedRepId ? "HELD_OK" : "NOT_POOLABLE", reason: "no company location", ...bare };
  }
  if (UNPOOLABLE_STATUSES.includes(c.status)) {
    return { state: c.assignedRepId ? "HELD_OK" : "NOT_POOLABLE", reason: `status is ${c.status}`, ...bare };
  }

  // --- Unassigned: it IS the pool ---
  if (c.assignedRepId === null) return { state: "IN_POOL", reason: "no rep assigned", ...bare };

  // --- Held: who holds it decides first ---
  // A manager or admin holding an account is deliberate, so it never recycles — and this check
  // precedes the deactivated-rep rule so a deactivated manager's account is not pooled either.
  if (c.repRole !== "SALES_REP") {
    return { state: "HELD_OK", reason: `held by a ${c.repRole ?? "unknown role"}`, ...bare };
  }
  // A deactivated rep works nothing, so the account is an orphan today, not in 90 days.
  if (c.repActive === false) {
    return { state: "HELD_RECYCLE", reason: "the rep who held it is deactivated", ...bare };
  }

  // --- Held by an active rep: work in flight protects it ---
  if (c.protectingQuote) return { state: "HELD_OK", reason: "a quote is in flight", ...bare };
  if (c.nextFollowUpAt !== null && c.nextFollowUpAt > now) {
    const out = wholeDaysBetween(now, c.nextFollowUpAt);
    if (out <= FOLLOW_UP_PROTECTION_MAX_DAYS) {
      return { state: "HELD_OK", reason: `a follow-up is booked for ${isoDay(c.nextFollowUpAt)}`, ...bare };
    }
  }

  // --- The clock ---
  const clockFrom = latest(c.assignedAt, c.lastContactAt, c.lastSaleAt);
  if (clockFrom === null) {
    // Nothing dates this account, so neglect cannot be proven. Task 8's go-live backfill gives
    // every held account an assignedAt, after which this branch is unreachable in practice.
    return { state: "HELD_OK", reason: "nothing dates this account yet", ...bare };
  }

  const dueAt = new Date(clockFrom.getTime() + RECYCLE_AFTER_DAYS * DAY_MS);
  const elapsed = wholeDaysBetween(clockFrom, now);
  const daysLeft = RECYCLE_AFTER_DAYS - elapsed;
  const since = `no contact or sale since ${isoDay(clockFrom)}`;

  if (elapsed >= RECYCLE_AFTER_DAYS) {
    const warnedDays = c.poolWarnedAt === null ? null : wholeDaysBetween(c.poolWarnedAt, now);
    if (warnedDays !== null && warnedDays >= MIN_WARNING_DAYS) {
      return { state: "HELD_RECYCLE", reason: `${since}, warned ${warnedDays} days ago`, clockFrom, dueAt, daysLeft };
    }
    // Past due but not yet fairly warned: hold it in the warning state until the notice has run.
    const reason =
      warnedDays === null
        ? `${since}; warning not yet recorded`
        : `${since}; warned ${warnedDays} of ${MIN_WARNING_DAYS} days ago`;
    return { state: "HELD_WARNING", reason, clockFrom, dueAt, daysLeft };
  }

  if (elapsed >= WARN_AFTER_DAYS) {
    return { state: "HELD_WARNING", reason: `${since} — ${daysLeft} days left`, clockFrom, dueAt, daysLeft };
  }

  return { state: "HELD_OK", reason: since, clockFrom, dueAt, daysLeft };
}

/** Can a rep take this one from the pool right now? */
export function isClaimable(c: PoolCustomer): boolean {
  // `now` does not affect pool membership, so any instant answers it.
  return decidePool(c, new Date()).state === "IN_POOL";
}

/**
 * Has this rep hit the claim cap? Returns the message to show them, or null to allow.
 * Managers and ADMIN are uncapped: the cap exists to stop a land grab by reps, and a
 * manager assigning accounts in bulk is the job.
 */
export function claimCapError(claimsInLast7Days: number, role: string): string | null {
  if (role !== "SALES_REP") return null;
  if (claimsInLast7Days < CLAIM_CAP_PER_7_DAYS) return null;
  return `You have claimed ${claimsInLast7Days} customers in the last 7 days (limit ${CLAIM_CAP_PER_7_DAYS}). Work those first, or ask a manager.`;
}
