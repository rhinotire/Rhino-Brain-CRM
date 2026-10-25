import { describe, it, expect } from "vitest";
import { buildCustomerFilterWhere, CUSTOMER_FILTER_STATES } from "./customer-filter";

const TYPES = ["TIRE_SHOP", "WHEEL_SHOP", "TRUCK_TIRE_SHOP", "ATV_GOLF", "CAR_DEALER", "OTHER"] as const;
const BS = String.fromCharCode(92); // one backslash, spelled out so no escaping layer can swallow it
const FL = { locationId: "loc_fl" };

function build(over: Partial<Parameters<typeof buildCustomerFilterWhere<(typeof TYPES)[number]>>[0]> = {}) {
  return buildCustomerFilterWhere({ scope: FL, allowedTypes: TYPES, ...over });
}

describe("buildCustomerFilterWhere", () => {
  it("returns exactly the scope when no filter is set", () => {
    expect(build()).toEqual({ locationId: "loc_fl" });
  });

  it("returns an empty object for an unscoped caller with no filters (admin on all locations / null-location user)", () => {
    expect(buildCustomerFilterWhere({ scope: {}, allowedTypes: TYPES })).toEqual({});
  });

  it("ignores absent, empty and whitespace-only filters - they must not become an empty-string match", () => {
    for (const empty of [undefined, "", "   ", "\t\n"]) {
      expect(build({ type: empty, city: empty, state: empty })).toEqual({ locationId: "loc_fl" });
    }
  });

  it("filters by type exactly", () => {
    expect(build({ type: "WHEEL_SHOP" })).toEqual({ locationId: "loc_fl", type: "WHEEL_SHOP" });
  });

  it("offers every type it is given, including ones added later", () => {
    const later = [...TYPES, "BRAND_NEW_TYPE"];
    expect(buildCustomerFilterWhere({ scope: FL, allowedTypes: later, type: "BRAND_NEW_TYPE" })).toMatchObject({ type: "BRAND_NEW_TYPE" });
  });

  it("drops a type that is not in the allowed set instead of passing it to Prisma (which would throw)", () => {
    expect(build({ type: "NOT_A_TYPE" })).toEqual({ locationId: "loc_fl" });
    expect(build({ type: "tire_shop" })).toEqual({ locationId: "loc_fl" }); // exact: case matters
  });

  it("matches city case-insensitively and trims it", () => {
    expect(build({ city: "  orlando " })).toEqual({ locationId: "loc_fl", city: { equals: "orlando", mode: "insensitive" } });
  });

  it("matches state case-insensitively (the data has TX, tx and Tx) and trims it", () => {
    expect(build({ state: " tx" })).toEqual({ locationId: "loc_fl", state: { equals: "tx", mode: "insensitive" } });
  });

  it("escapes LIKE wildcards so a crafted city/state matches literally, not 'everything'", () => {
    // Prisma compiles insensitive equals to ILIKE, where a bare % matches every row.
    expect(build({ city: "%" }).city).toEqual({ equals: BS + "%", mode: "insensitive" });
    expect(build({ city: "ORL_NDO" }).city).toEqual({ equals: "ORL" + BS + "_NDO", mode: "insensitive" });
    expect(build({ state: "%" }).state).toEqual({ equals: BS + "%", mode: "insensitive" });
    expect(build({ city: "a" + BS + "b" }).city).toEqual({ equals: "a" + BS + BS + "b", mode: "insensitive" });
  });

  it("combines all three filters with the scope", () => {
    expect(build({ type: "TRUCK_TIRE_SHOP", city: "Dallas", state: "TX" })).toEqual({
      locationId: "loc_fl",
      type: "TRUCK_TIRE_SHOP",
      city: { equals: "Dallas", mode: "insensitive" },
      state: { equals: "TX", mode: "insensitive" },
    });
  });

  it("treats a non-string (repeated query param -> array) as absent", () => {
    expect(build({ type: ["WHEEL_SHOP", "TIRE_SHOP"], city: ["a", "b"], state: ["TX"] })).toEqual({ locationId: "loc_fl" });
  });

  describe("company isolation - no filter value can widen the location scope", () => {
    const hostile: unknown[] = [
      "x\" OR \"locationId\" <> 'loc_fl",
      "loc_tx",
      "%", "_", BS, "'; DROP TABLE \"Customer\"; --",
      { locationId: "loc_tx" }, { not: "loc_fl" }, { OR: [{ locationId: "loc_tx" }] },
      ["loc_tx"], null, 0, true,
    ];

    it("keeps the caller's locationId whatever the filters contain", () => {
      for (const h of hostile) {
        const where = build({ type: h, city: h, state: h }) as Record<string, unknown>;
        expect(where.locationId).toBe("loc_fl");
        // Nothing but the scope and the three filter keys can ever appear.
        expect(Object.keys(where).every(k => ["locationId", "type", "city", "state"].includes(k))).toBe(true);
      }
    });

    it("only ever places a filter value as a leaf under its own key", () => {
      const where = build({ type: "WHEEL_SHOP", city: "other-company", state: "{\"locationId\":\"loc_tx\"}" }) as Record<string, any>;
      expect(where.locationId).toBe("loc_fl");
      expect(where.city).toEqual({ equals: "other-company", mode: "insensitive" });
      expect(Object.keys(where.state)).toEqual(["equals", "mode"]);
    });

    it("never invents a scope the caller did not have (admin/null-location keeps seeing everything it saw)", () => {
      for (const h of hostile) {
        const where = buildCustomerFilterWhere({ scope: {}, allowedTypes: TYPES, type: h, city: h, state: h });
        expect("locationId" in where).toBe(false);
      }
    });
  });
});

describe("CUSTOMER_FILTER_STATES", () => {
  it("is the 50 states + DC + PR as upper-case 2-letter codes, with the two company home states present", () => {
    expect(CUSTOMER_FILTER_STATES).toContain("FL");
    expect(CUSTOMER_FILTER_STATES).toContain("TX");
    expect(CUSTOMER_FILTER_STATES.every(s => /^[A-Z]{2}$/.test(s))).toBe(true);
    expect(new Set(CUSTOMER_FILTER_STATES).size).toBe(CUSTOMER_FILTER_STATES.length);
    expect(CUSTOMER_FILTER_STATES.length).toBe(52);
  });
});
