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
 * camelCase columns. Every value goes through `params`, never into the text;
 * enum comparisons are cast because Prisma sends string parameters untyped.
 */

/** Slots per rep per day. Shared by the cron's leads and the dealer list. */
export const PROSPECT_RELEASE_LIMIT = 5;

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
    // Tier 1 first; no tier (cron leads, malformed values) last; then newest; "id" keeps
    // the order stable when a batch import gave many rows the same createdAt.
    `ORDER BY (CASE WHEN "meta"->>'tier' ~ '^[0-9]+$' THEN ("meta"->>'tier')::int END) ASC NULLS LAST, "createdAt" DESC, "id" ASC`,
    `LIMIT ${PROSPECT_RELEASE_LIMIT}`,
  ].join("\n");

  return { sql, params };
}
