/**
 * Which unworked AI-prospecting leads My Work releases to a rep, and in what
 * order (dealer-list activation spec section 8.3).
 *
 * Prisma cannot orderBy a JSON path, and the dealer-locator importer stores its
 * release tier at Lead.meta.tier, so this is raw SQL. The builder is pure: it
 * returns `{ sql, params }` with `$n` placeholders and touches no database, so
 * the predicate is unit-testable and the page just runs
 * `db.$queryRawUnsafe(sql, ...params)`. Imports nothing, on purpose: this file
 * is reachable from app code and must stay free of Prisma / fs / xlsx.
 *
 * Column and table names are Prisma's own (no @map/@@map on Lead): "Lead" and
 * camelCase columns. Every request value goes through `params`, never into the
 * text (only the code-constant rank map is emitted inline); enum comparisons are
 * cast because Prisma sends string parameters untyped.
 *
 * Parked leads (dealer-list Canada and international rows, spec section 8
 * decision 2) are recorded by the importer as locationId = null, which the
 * unconditional IS NOT NULL below already hides from every role. The Qingdao
 * location itself is NOT excluded: its leads are the cron's real international
 * drip, worked by the Qingdao rep.
 */

/** Slots per rep per day. Shared by the cron's leads and the dealer list. */
export const PROSPECT_RELEASE_LIMIT = 5;

/**
 * Dealer-list leads carry meta.tier (1-4) and no score; cron leads carry a score
 * (0-100) and no tier. To make them compete for the same slots (spec section 8
 * decision 3: the cron's drip is never buried) both are put on ONE rank scale:
 * a tier maps onto the score scale, an untiered lead uses its own score.
 * Higher rank releases first. Owner-reviewable.
 */
export const TIER_RANK: Readonly<Record<1 | 2 | 3 | 4, number>> = { 1: 85, 2: 70, 3: 55, 4: 40 };

/** Rank of a lead with neither a (valid) tier nor a score. Sits between tier 3 and tier 4. */
export const UNTIERED_UNSCORED_RANK = 50;

/**
 * The rank a lead releases at. Reference semantics of the SQL rank CASE below
 * (which is generated from the same constants): a tier outside 1-4, or a
 * non-numeric one, is "no tier".
 */
export function releaseRank(lead: { tier?: unknown; score?: number | null }): number {
  const t = typeof lead.tier === "number" ? String(lead.tier) : typeof lead.tier === "string" ? lead.tier : "";
  if (/^[1-4]$/.test(t)) return TIER_RANK[Number(t) as 1 | 2 | 3 | 4];
  return lead.score ?? UNTIERED_UNSCORED_RANK;
}

/** Same rule as releaseRank, as a SQL expression. Constants only; no request value is interpolated. */
export const RELEASE_RANK_SQL =
  `(CASE ${(Object.entries(TIER_RANK) as [string, number][]).map(([tier, rank]) => `WHEN "meta"->>'tier' = '${tier}' THEN ${rank}`).join(" ")} ELSE COALESCE("score", ${UNTIERED_UNSCORED_RANK}) END)`;

export type ProspectReleaseInput = {
  /** The signed-in user: sees unassigned leads plus the ones they already claimed. */
  userId: string;
  /** The user's company location. Null for admin/manager: no per-company scoping. */
  locationId: string | null;
};

/** The columns My Work reads. Mirrors the page's ProspectRow mapping. */
export type ProspectReleaseRow = {
  id: string;
  companyName: string;
  city: string | null;
  state: string | null;
  phone: string | null;
  score: number | null;
  productLine: string | null;
  assignedRepId: string | null;
  meta: unknown;
};

export function buildProspectReleaseQuery(input: ProspectReleaseInput): { sql: string; params: unknown[] } {
  const params: unknown[] = [];
  // Pushes a value and returns its `$n` placeholder.
  const p = (value: unknown) => { params.push(value); return `$${params.length}`; };

  const where = [
    `"source" = ${p("PROSPECTING")}::"CustomerSource"`,
    `"stage" = ${p("NEW_LEAD")}::"PipelineStage"`,
    `"convertedCustomerId" IS NULL`,
    `("pool" IS NULL OR "pool" <> ${p("D_EXCLUDED")}::"ProspectPool")`,
    `("assignedRepId" IS NULL OR "assignedRepId" = ${p(input.userId)})`,
    // Orphans (null locationId: parked non-home-state, Canadian and international
    // dealers) are hidden from EVERY role. An admin claiming one would route it
    // to the wrong company's rep.
    `"locationId" IS NOT NULL`,
  ];
  // Rhino FL and Everflow TX share one database: a rep only sees their own company's leads.
  if (input.locationId) where.push(`"locationId" = ${p(input.locationId)}`);

  const sql = [
    `SELECT "id", "companyName", "city", "state", "phone", "score", "productLine", "assignedRepId", "meta"`,
    `FROM "Lead"`,
    `WHERE ${where.join("\n  AND ")}`,
    // Best rank first (tier mapped onto the score scale, so cron and dealer leads compete);
    // then newest, so a fresh cron lead beats an older import at the same rank; "id" keeps
    // the order stable when a batch import gave many rows the same createdAt.
    `ORDER BY ${RELEASE_RANK_SQL} DESC, "createdAt" DESC, "id" ASC`,
    `LIMIT ${PROSPECT_RELEASE_LIMIT}`,
  ].join("\n");

  return { sql, params };
}
