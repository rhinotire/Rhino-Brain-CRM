/**
 * Per-batch conversion rollup for imported dealer-list leads (dealer-list
 * activation, Task 10). Pure arithmetic: the caller reads the rows (read-only),
 * this groups them by `meta.tier` and counts the funnel. Prisma cannot filter or
 * group on a JSON path, so the grouping has to happen here in TypeScript.
 *
 * The CLI wrapper is packages/database/scripts/reconcile-dealers.ts (--batch).
 * Server-side only; deliberately not re-exported from the services index, and
 * deliberately import-free (see the build rules).
 *
 * WHAT EACH METRIC IS BACKED BY. There is no dedicated funnel table, so each
 * metric is built from the fields the app already writes, and a metric is only
 * counted on evidence (never inferred from a rate or a guess):
 *
 *   leads      one row per Lead in the batch(es).
 *   contacted  the lead has an Activity (Activity.leadId) whose type is one the app
 *              itself treats as contact (CONTACT_ACTIVITY_TYPES, the same list
 *              actions/activities.ts uses to move NEW_LEAD -> CONTACTED), OR the lead's
 *              stage has left NEW_LEAD for a working stage, OR it is quoted/converted.
 *              NO_ANSWER / VOICEMAIL / INTERNAL_NOTE are attempts, not contact.
 *   quoted     a QUOTE-type Activity on the lead, OR stage QUOTED / NEGOTIATING, OR a
 *              non-draft Quote on its converted customer created at/after conversion.
 *              (Quote belongs to Customer, never to Lead, so a quote can only exist as a
 *              row after conversion; before that, quoting is recorded as an activity or
 *              a stage.)
 *   converted  Lead.convertedCustomerId is set (convertLead writes it). A stage of
 *              FIRST_ORDER / ACTIVE_CUSTOMER with no convertedCustomerId is NOT counted;
 *              it is reported separately as stageWonNotConverted.
 *   value      sum of Order.total for the converted customer with orderDate at/after
 *              Lead.convertedAt. Orders from before the conversion are not this lead's win.
 *              A customer merged from several leads is valued once (so `converted` counts
 *              leads while the dollars are per customer). A customer created more than
 *              PREEXISTING_CUSTOMER_TOLERANCE_MS before convertedAt (a duplicate merged into
 *              a long-standing customer) has its dollars reported separately as
 *              convertedValueUnverified, never blended into convertedValue.
 *
 * There is no Task source: Task links to Customer, not Lead, so it cannot say anything
 * about an unconverted lead.
 */

/** Activity types the app counts as real contact (mirrors CONTACT_TYPES in actions/activities.ts). */
export const CONTACT_ACTIVITY_TYPES = [
  "CALL", "EMAIL", "TEXT", "WHATSAPP", "QUOTE", "ORDER", "PAYMENT", "VISIT", "COMPLAINT",
] as const;

/** Pipeline stages that mean a rep has worked the lead (LOST is excluded: it can be junk-rejected untouched). */
const WORKED_STAGES: readonly string[] = ["CONTACTED", "INTERESTED", "QUOTED", "NEGOTIATING", "FIRST_ORDER", "ACTIVE_CUSTOMER"];
const QUOTED_STAGES: readonly string[] = ["QUOTED", "NEGOTIATING"];
const WON_STAGES: readonly string[] = ["FIRST_ORDER", "ACTIVE_CUSTOMER"];

/**
 * Release-order tiers, mirrored from dealer-tier.ts (a test calls tierFor() to keep them in step).
 * A lower number is released to reps earlier. Tier 1 is existing customers (cross-sell, not a
 * prospect), so tier 2 is the best PROSPECT tier; 8 is parked and 9 is blacklisted.
 */
const TIER_LABELS: Record<number, string> = {
  1: "existing customer (cross-sell)",
  2: "home state, 2+ brands",
  3: "home state, 1 brand, within ~150 mi of a hub",
  4: "home state, 1 brand, farther out",
  5: "non-home state, 3+ brands",
  6: "non-home state, dense metro",
  7: "non-home state, 1-2 brands",
  8: "Canada / international (parked)",
  9: "blacklist / opted out",
};
export const NO_TIER_LABEL = "no tier recorded (meta.tier missing or not a whole number)";

export function tierLabel(tier: number | null): string {
  if (tier === null) return NO_TIER_LABEL;
  return TIER_LABELS[tier] ?? `tier ${tier} (unlabelled)`;
}

/**
 * convertLead creates the customer a moment before it stamps convertedAt, so a customer
 * the conversion itself made is created within milliseconds BEFORE convertedAt. Only a
 * customer created longer ago than this is treated as one that predates the conversion.
 */
export const PREEXISTING_CUSTOMER_TOLERANCE_MS = 10 * 60 * 1000;

export type BatchLead = {
  id: string;
  meta: unknown;
  stage: string;
  convertedCustomerId: string | null;
  convertedAt: Date | null;
  /** Customer.createdAt of convertedCustomerId. null = unknown (treated as unverified). */
  customerCreatedAt: Date | null;
  assignedRepId: string | null;
  /** null = parked (Canada / non-home-state): no rep can ever see the lead. */
  locationId: string | null;
};
export type BatchActivity = { leadId: string; type: string };
export type BatchQuote = { customerId: string; createdAt: Date; status: string };
export type BatchOrder = { customerId: string; orderDate: Date; total: number };

export type Counts = {
  leads: number;
  /** a rep has taken the lead (assignedRepId set) */
  claimed: number;
  /** locationId is null: never shown to any rep, cannot be worked */
  parked: number;
  contacted: number;
  quoted: number;
  converted: number;
  /**
   * dollars, rounded to the cent. Only customers the conversion itself created.
   * Deduped per customer, whereas `converted` counts leads: two leads merged into
   * one customer are converted=2 against one customer's dollars.
   */
  convertedValue: number;
  /**
   * Converted leads whose customer record predates the conversion by more than the
   * tolerance (a duplicate merged into a long-standing customer by
   * actions/customer-merge.ts, which re-points convertedCustomerId and leaves
   * convertedAt alone) or whose creation time is unknown. Their orders are ordinary
   * repeat business, not proof the dealer list won them, so the dollars are kept OUT of
   * convertedValue and reported here instead. `converted` still counts the lead.
   */
  convertedUnverified: number;
  /** order dollars of those customers (deduped per customer), rounded to the cent */
  convertedValueUnverified: number;
  /** converted / contacted, or null when nothing was contacted (a rate of 0/0 is not 0%) */
  convertedPerContacted: number | null;
};
export type TierRollup = Counts & { tier: number | null; label: string };
export type BatchRollup = {
  /** best tier (lowest number) first; leads with no readable tier last */
  tiers: TierRollup[];
  total: Counts;
  /** stage says FIRST_ORDER / ACTIVE_CUSTOMER but convertedCustomerId is null: not counted as converted */
  stageWonNotConverted: number;
  /** convertedCustomerId set but convertedAt null: counted as converted, no value can be dated */
  convertedWithoutDate: number;
};

function tierOf(meta: unknown): number | null {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  const t = (meta as Record<string, unknown>).tier;
  return typeof t === "number" && Number.isInteger(t) ? t : null;
}

const emptyCounts = (): Counts => ({
  leads: 0, claimed: 0, parked: 0, contacted: 0, quoted: 0, converted: 0, convertedValue: 0,
  convertedUnverified: 0, convertedValueUnverified: 0, convertedPerContacted: null,
});

export function rollupBatch(input: {
  leads: BatchLead[];
  activities: BatchActivity[];
  quotes: BatchQuote[];
  orders: BatchOrder[];
}): BatchRollup {
  const contactTypes = new Set<string>(CONTACT_ACTIVITY_TYPES);
  const contactedByActivity = new Set<string>();
  const quotedByActivity = new Set<string>();
  for (const a of input.activities) {
    if (!contactTypes.has(a.type)) continue;
    contactedByActivity.add(a.leadId);
    if (a.type === "QUOTE") quotedByActivity.add(a.leadId);
  }

  const quotesByCustomer = new Map<string, BatchQuote[]>();
  for (const q of input.quotes) {
    const list = quotesByCustomer.get(q.customerId);
    if (list) list.push(q); else quotesByCustomer.set(q.customerId, [q]);
  }
  const ordersByCustomer = new Map<string, BatchOrder[]>();
  for (const o of input.orders) {
    const list = ordersByCustomer.get(o.customerId);
    if (list) list.push(o); else ordersByCustomer.set(o.customerId, [o]);
  }

  const byTier = new Map<number | null, Counts>();
  const total = emptyCounts();
  const centsByTier = new Map<number | null, number>();
  const unverifiedCentsByTier = new Map<number | null, number>();
  let totalCents = 0;
  let totalUnverifiedCents = 0;
  let stageWonNotConverted = 0;
  let convertedWithoutDate = 0;
  const valuedCustomers = new Set<string>();

  // Deterministic order, so a customer merged from several leads is always valued
  // under the same lead (the lowest id) whatever order the rows were read in.
  const leads = [...input.leads].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const l of leads) {
    const tier = tierOf(l.meta);
    const c = byTier.get(tier) ?? emptyCounts();
    byTier.set(tier, c);

    const converted = l.convertedCustomerId !== null;
    const at = l.convertedAt;
    if (converted && at === null) convertedWithoutDate++;
    if (!converted && WON_STAGES.includes(l.stage)) stageWonNotConverted++;

    // A customer that predates the conversion (merged keeper) has its own quotes and orders
    // that are not this list's doing; same guard for quotes as for dollars.
    const unverified =
      converted && at !== null &&
      (l.customerCreatedAt === null || l.customerCreatedAt.getTime() < at.getTime() - PREEXISTING_CUSTOMER_TOLERANCE_MS);
    const quotedByRow =
      converted && at !== null && !unverified &&
      (quotesByCustomer.get(l.convertedCustomerId as string) ?? []).some((q) => q.status !== "DRAFT" && q.createdAt >= at);
    const quoted = quotedByActivity.has(l.id) || QUOTED_STAGES.includes(l.stage) || quotedByRow;
    const contacted = contactedByActivity.has(l.id) || WORKED_STAGES.includes(l.stage) || quoted || converted;

    for (const t of [c, total]) {
      t.leads++;
      if (l.assignedRepId) t.claimed++;
      if (l.locationId === null) t.parked++;
      if (contacted) t.contacted++;
      if (quoted) t.quoted++;
      if (converted) t.converted++;
      if (unverified) t.convertedUnverified++;
    }

    if (converted && at !== null && !valuedCustomers.has(l.convertedCustomerId as string)) {
      valuedCustomers.add(l.convertedCustomerId as string);
      let cents = 0;
      for (const o of ordersByCustomer.get(l.convertedCustomerId as string) ?? []) {
        if (o.orderDate >= at) cents += Math.round(o.total * 100);
      }
      if (unverified) {
        unverifiedCentsByTier.set(tier, (unverifiedCentsByTier.get(tier) ?? 0) + cents);
        totalUnverifiedCents += cents;
      } else {
        centsByTier.set(tier, (centsByTier.get(tier) ?? 0) + cents);
        totalCents += cents;
      }
    }
  }

  const finish = (c: Counts, cents: number, unverifiedCents: number): Counts => ({
    ...c,
    convertedValue: cents / 100,
    convertedValueUnverified: unverifiedCents / 100,
    convertedPerContacted: c.contacted > 0 ? c.converted / c.contacted : null,
  });

  const tiers: TierRollup[] = [...byTier.entries()]
    .sort(([a], [b]) => (a === null ? 1 : b === null ? -1 : a - b))
    .map(([tier, c]) => ({ tier, label: tierLabel(tier), ...finish(c, centsByTier.get(tier) ?? 0, unverifiedCentsByTier.get(tier) ?? 0) }));

  return { tiers, total: finish(total, totalCents, totalUnverifiedCents), stageWonNotConverted, convertedWithoutDate };
}

/**
 * The batch-level reconciliation line: the importer's own record of how many leads it
 * CREATED under this batch (ImportBatch.successful, see importBatchFigures) against the leads
 * that carry the batch id right now. Two independent sources, compared exactly: a shortfall
 * means leads were lost or moved after the importer counted them. Updated leads are not in
 * either number (they keep the batch they were first imported under).
 */
export function importBatchLeadCountCheck(batch: { id: string; successful: number }, leadsInBatch: number): { ok: boolean; label: string } {
  return {
    ok: batch.successful === leadsInBatch,
    label: `ImportBatch ${batch.id} created (${batch.successful}) = leads now in that batch (${leadsInBatch})`,
  };
}
