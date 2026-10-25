import { describe, it, expect } from "vitest";
import { buildProspectReleaseQuery, PROSPECT_RELEASE_LIMIT } from "./prospect-release";

const REP = { userId: "rep_1", locationId: "loc_fl" as string | null };

describe("buildProspectReleaseQuery", () => {
  it("never surfaces a lead with a null locationId", () => {
    // For every role: a rep scoped to a location, and an admin/manager with none.
    for (const locationId of ["loc_fl", null]) {
      const { sql } = buildProspectReleaseQuery({ userId: "u1", locationId });
      expect(sql).toContain(`"locationId" IS NOT NULL`);
    }
  });

  it("scopes to the session location when there is one, and only then", () => {
    const scoped = buildProspectReleaseQuery(REP);
    expect(scoped.sql).toMatch(/"locationId" = \$\d+/);
    expect(scoped.params).toContain("loc_fl");

    const unscoped = buildProspectReleaseQuery({ userId: "admin_1", locationId: null });
    expect(unscoped.sql).not.toMatch(/"locationId" = /);
    expect(unscoped.params).not.toContain(null);
  });

  it("orders tier 2 dealer-list leads above tier 4 ones (tier ascending, untiered last, then newest)", () => {
    const { sql } = buildProspectReleaseQuery(REP);
    const orderBy = sql.slice(sql.indexOf("ORDER BY"));
    // tier is compared as a number (so a future tier 10 cannot sort before tier 2) ...
    expect(orderBy).toMatch(/^ORDER BY \(CASE WHEN "meta"->>'tier' ~ '\^\[0-9\]\+\$' THEN \("meta"->>'tier'\)::int END\) ASC NULLS LAST, "createdAt" DESC/);
    // ... and tier is the FIRST sort key, createdAt only the tie-breaker.
    expect(orderBy.indexOf("tier")).toBeLessThan(orderBy.indexOf("createdAt"));
  });

  it("still returns at most 5 rows when both cron and dealer leads exist", () => {
    expect(PROSPECT_RELEASE_LIMIT).toBe(5);
    const { sql } = buildProspectReleaseQuery(REP);
    // One shared pool: no source split, so cron and dealer-list leads compete for the same 5 slots.
    expect(sql.trimEnd()).toMatch(/LIMIT 5$/);
    expect(sql.match(/LIMIT/g)).toHaveLength(1);
  });

  it("keeps every filter the old Prisma query applied", () => {
    const { sql, params } = buildProspectReleaseQuery(REP);
    expect(sql).toMatch(/"source" = \$(\d+)::"CustomerSource"/);
    expect(sql).toMatch(/"stage" = \$(\d+)::"PipelineStage"/);
    expect(sql).toContain(`"convertedCustomerId" IS NULL`);
    expect(sql).toMatch(/\("pool" IS NULL OR "pool" <> \$\d+::"ProspectPool"\)/);
    expect(sql).toMatch(/\("assignedRepId" IS NULL OR "assignedRepId" = \$\d+\)/);
    expect(params).toEqual(expect.arrayContaining(["PROSPECTING", "NEW_LEAD", "D_EXCLUDED", "rep_1"]));
  });

  it("selects the columns the My Work page reads", () => {
    const { sql } = buildProspectReleaseQuery(REP);
    const select = sql.slice(0, sql.indexOf("FROM"));
    for (const col of ["id", "companyName", "city", "state", "phone", "score", "productLine", "assignedRepId", "meta"]) {
      expect(select).toContain(`"${col}"`);
    }
    expect(sql).toContain(`FROM "Lead"`);
  });

  it("passes every value as a parameter, never in the SQL text", () => {
    const evil = `x'; DROP TABLE "Lead"; --`;
    for (const locationId of [evil, null]) {
      const { sql, params } = buildProspectReleaseQuery({ userId: evil, locationId });
      expect(sql).not.toContain("DROP");
      expect(sql).not.toContain("rep_1");
      expect(params).toContain(evil);
      // $1..$N is a gap-free, in-range reference set that matches params one-to-one.
      const refs = new Set([...sql.matchAll(/\$(\d+)/g)].map(m => Number(m[1])));
      expect([...refs].sort((a, b) => a - b)).toEqual(params.map((_, i) => i + 1));
    }
  });
});

describe("buildProspectReleaseQuery exact output", () => {
  it("scoped rep: the full statement and parameter list", () => {
    expect(buildProspectReleaseQuery(REP)).toEqual({
      sql: [
        `SELECT "id", "companyName", "city", "state", "phone", "score", "productLine", "assignedRepId", "meta"`,
        `FROM "Lead"`,
        `WHERE "source" = $1::"CustomerSource"`,
        `  AND "stage" = $2::"PipelineStage"`,
        `  AND "convertedCustomerId" IS NULL`,
        `  AND ("pool" IS NULL OR "pool" <> $3::"ProspectPool")`,
        `  AND ("assignedRepId" IS NULL OR "assignedRepId" = $4)`,
        `  AND "locationId" IS NOT NULL`,
        `  AND "locationId" = $5`,
        `ORDER BY (CASE WHEN "meta"->>'tier' ~ '^[0-9]+$' THEN ("meta"->>'tier')::int END) ASC NULLS LAST, "createdAt" DESC, "id" ASC`,
        `LIMIT 5`,
      ].join("\n"),
      params: ["PROSPECTING", "NEW_LEAD", "D_EXCLUDED", "rep_1", "loc_fl"],
    });
  });
});
