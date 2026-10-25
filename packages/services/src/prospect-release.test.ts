import { describe, it, expect } from "vitest";
import {
  buildProspectReleaseQuery, releaseRank, PROSPECT_RELEASE_LIMIT, TIER_RANK, UNTIERED_UNSCORED_RANK, RELEASE_RANK_SQL,
} from "./prospect-release";

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

  it("orders tier 2 dealer-list leads above tier 4 ones (best rank first, then newest)", () => {
    expect(releaseRank({ tier: 2 })).toBeGreaterThan(releaseRank({ tier: 4 }));
    const { sql } = buildProspectReleaseQuery(REP);
    const orderBy = sql.slice(sql.indexOf("ORDER BY"));
    // rank is the FIRST sort key (descending), createdAt only a tie-breaker.
    expect(orderBy).toBe(`ORDER BY ${RELEASE_RANK_SQL} DESC, "createdAt" DESC, "id" ASC
LIMIT 5`);
    expect(orderBy).not.toMatch(/NULLS/);
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

  it("never releases a parked lead: Canada/international dealer rows have no location, for any role", () => {
    // The importer parks them as locationId = null. A rep scoped to ANY location, including
    // the one an international lead might once have been routed to, still gets IS NOT NULL.
    for (const locationId of ["loc_qingdao", "loc_fl", null]) {
      const { sql } = buildProspectReleaseQuery({ userId: "u", locationId });
      expect(sql).toContain(`"locationId" IS NOT NULL`);
    }
  });

  it("does not exclude the Qingdao location: its cron leads are real, worked drip", () => {
    const { sql, params } = buildProspectReleaseQuery({ userId: "april", locationId: "loc_qingdao" });
    expect(sql).toMatch(/"locationId" = \$\d+/);
    expect(sql).not.toMatch(/"locationId" (<>|!=|NOT IN)/);
    expect(params).toContain("loc_qingdao");
  });
});

describe("release rank: dealer tiers and cron scores compete on one scale", () => {
  const RANKED_TIERS = [2, 3, 4, 5, 6, 7, 8] as const;

  it("a tier-2 dealer (best releasable) outranks a score-70 cron lead", () => {
    expect(releaseRank({ tier: 2 })).toBeGreaterThan(releaseRank({ score: 70 }));
  });
  it("a score-90 cron lead outranks a tier-2 dealer, and a score-80 one outranks a tier-3 dealer", () => {
    expect(releaseRank({ score: 90 })).toBeGreaterThan(releaseRank({ tier: 2 }));
    expect(releaseRank({ score: 80 })).toBeGreaterThan(releaseRank({ tier: 3 }));
  });
  it("a tier-4 dealer outranks a score-30 cron lead", () => {
    expect(releaseRank({ tier: 4 })).toBeGreaterThan(releaseRank({ score: 30 }));
  });
  it("a tier-5 lead ranks below a tier-4 one (non-home never beats home)", () => {
    expect(releaseRank({ tier: 5 })).toBeLessThan(releaseRank({ tier: 4 }));
  });
  it("a worse tier never outranks a better one, across the whole 2-8 scheme", () => {
    for (let i = 0; i < RANKED_TIERS.length - 1; i++) {
      expect(releaseRank({ tier: RANKED_TIERS[i] })).toBeGreaterThan(releaseRank({ tier: RANKED_TIERS[i + 1] }));
    }
  });
  it("tier 1 (existing customer) and tier 9 (blacklisted) rank at the very bottom, fail-safe", () => {
    const floor = Math.min(...RANKED_TIERS.map(t => releaseRank({ tier: t })));
    for (const tier of [1, 9]) {
      expect(releaseRank({ tier })).toBeLessThan(floor);
      expect(releaseRank({ tier })).toBeLessThan(releaseRank({ tier: 8 }));
      expect(releaseRank({ tier })).toBeLessThan(UNTIERED_UNSCORED_RANK);
      // as numbers and as strings
      expect(releaseRank({ tier: String(tier) })).toBe(releaseRank({ tier }));
    }
    expect(TIER_RANK[1]).toBe(TIER_RANK[9]);
  });
  it("an untiered, unscored lead lands between tier 4 and tier 5", () => {
    expect(releaseRank({})).toBeLessThan(releaseRank({ tier: 4 }));
    expect(releaseRank({})).toBeGreaterThan(releaseRank({ tier: 5 }));
    expect(releaseRank({ tier: null, score: null })).toBe(UNTIERED_UNSCORED_RANK);
  });
  it("a junk, out-of-range or non-numeric tier is treated as untiered, never NULL", () => {
    for (const tier of [0, 10, 11, 99, 2.5, -1, "", "abc", "2x", " 2", "10", null, undefined, {}, [2], NaN]) {
      expect(releaseRank({ tier, score: 61 })).toBe(61);
      expect(releaseRank({ tier })).toBe(UNTIERED_UNSCORED_RANK);
    }
    // numeric and string forms of a valid tier both count
    expect(releaseRank({ tier: "3" })).toBe(TIER_RANK[3]);
    expect(releaseRank({ tier: 3 })).toBe(TIER_RANK[3]);
    // a valid tier beats the lead's own score
    expect(releaseRank({ tier: 8, score: 95 })).toBe(TIER_RANK[8]);
  });
  it("the SQL rank CASE is generated from the same map, with a score/untiered fallback and no NULL arm", () => {
    expect(RELEASE_RANK_SQL).toBe(
      `(CASE WHEN "meta"->>'tier' = '1' THEN 5 WHEN "meta"->>'tier' = '2' THEN 85 WHEN "meta"->>'tier' = '3' THEN 70 WHEN "meta"->>'tier' = '4' THEN 55 WHEN "meta"->>'tier' = '5' THEN 40 WHEN "meta"->>'tier' = '6' THEN 35 WHEN "meta"->>'tier' = '7' THEN 25 WHEN "meta"->>'tier' = '8' THEN 10 WHEN "meta"->>'tier' = '9' THEN 5 ELSE COALESCE("score", 50) END)`,
    );
    expect(TIER_RANK).toEqual({ 1: 5, 2: 85, 3: 70, 4: 55, 5: 40, 6: 35, 7: 25, 8: 10, 9: 5 });
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
        `ORDER BY (CASE WHEN "meta"->>'tier' = '1' THEN 5 WHEN "meta"->>'tier' = '2' THEN 85 WHEN "meta"->>'tier' = '3' THEN 70 WHEN "meta"->>'tier' = '4' THEN 55 WHEN "meta"->>'tier' = '5' THEN 40 WHEN "meta"->>'tier' = '6' THEN 35 WHEN "meta"->>'tier' = '7' THEN 25 WHEN "meta"->>'tier' = '8' THEN 10 WHEN "meta"->>'tier' = '9' THEN 5 ELSE COALESCE("score", 50) END) DESC, "createdAt" DESC, "id" ASC`,
        `LIMIT 5`,
      ].join("\n"),
      params: ["PROSPECTING", "NEW_LEAD", "D_EXCLUDED", "rep_1", "loc_fl"],
    });
  });
});
