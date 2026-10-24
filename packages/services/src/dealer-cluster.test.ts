import { describe, it, expect } from "vitest";
import { attachCoordinates, clusterByCity, unroutableDealers, milesFromHub } from "./dealer-cluster";
import { countryFromState } from "./geo-state";
import type { GeoDealerRecord } from "./dealer-cluster";
import type { DealerRecord, DealerLocation } from "./dealer-list-parse";

// Test fixture only. Country is derived from state exactly as the parser does.
// Top-level address fields mirror locations[0] unless the caller overrides them.
function rec(over: Partial<DealerRecord> = {}): DealerRecord {
  const state = over.state ?? over.locations?.[0]?.state ?? "FL";
  const city = over.city ?? over.locations?.[0]?.city ?? "";
  return {
    name: "Test Dealer",
    street: "",
    city,
    state,
    zip: "",
    phone: "",
    email: "",
    website: "",
    brands: ["A"],
    locations: [{ street: "", city, state, zip: "" }],
    country: countryFromState(state),
    dedupeKey: "",
    ...over,
  };
}

const loc = (street: string, city: string, state: string, zip = ""): DealerLocation => ({ street, city, state, zip });

describe("attachCoordinates", () => {
  it("attaches coordinates by dedupeKey and leaves unmatched records untouched", () => {
    const hit = rec({ name: "Hit", dedupeKey: "k1" });
    const miss = rec({ name: "Miss", dedupeKey: "k2" });
    const out = attachCoordinates([hit, miss], [{ dedupeKey: "k1", lat: 28.5, lng: -81.4 }]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ name: "Hit", lat: 28.5, lng: -81.4 });
    // Unmatched: same object, no lat/lng keys at all (not 0, not null, not undefined-valued).
    expect(out[1]).toBe(miss);
    expect("lat" in out[1]).toBe(false);
    expect("lng" in out[1]).toBe(false);
  });

  it("never drops records and does not mutate its input", () => {
    const a = rec({ dedupeKey: "k1" });
    const input = [a, rec({ dedupeKey: "k2" }), rec({ dedupeKey: "" })];
    const out = attachCoordinates(input, [{ dedupeKey: "k1", lat: 30, lng: -90 }]);
    expect(out).toHaveLength(3);
    expect("lat" in a).toBe(false);
  });

  it("never matches a record with an empty dedupeKey, even against an empty-key coordinate", () => {
    const out = attachCoordinates([rec({ dedupeKey: "" })], [{ dedupeKey: "", lat: 30, lng: -90 }]);
    expect("lat" in out[0]).toBe(false);
  });

  it("ignores unusable coordinates instead of attaching 0,0 or NaN", () => {
    const bad = [
      { dedupeKey: "a", lat: 0, lng: 0 },
      { dedupeKey: "b", lat: NaN, lng: -90 },
      { dedupeKey: "c", lat: 91, lng: -90 },
      { dedupeKey: "d", lat: 30, lng: -181 },
    ];
    const out = attachCoordinates(["a", "b", "c", "d"].map((k) => rec({ dedupeKey: k })), bad);
    for (const o of out) expect("lat" in o).toBe(false);
  });

  it("uses the first coordinate when a dedupeKey appears twice", () => {
    const out = attachCoordinates([rec({ dedupeKey: "k" })], [
      { dedupeKey: "k", lat: 30, lng: -90 },
      { dedupeKey: "k", lat: 40, lng: -100 },
    ]);
    expect(out[0]).toMatchObject({ lat: 30, lng: -90 });
  });
});

describe("clusterByCity", () => {
  it("groups dealers in the same city+state into one cluster, biggest first", () => {
    const out = clusterByCity([
      rec({ name: "O1", city: "Orlando", state: "FL" }),
      rec({ name: "T1", city: "Tampa", state: "FL" }),
      rec({ name: "O2", city: "Orlando", state: "FL" }),
      rec({ name: "O3", city: "orlando ", state: "fl" }),
    ]);
    expect(out.map((c) => [c.city, c.state, c.count])).toEqual([
      ["Orlando", "FL", 3],
      ["Tampa", "FL", 1],
    ]);
    expect(out[0].members.map((m) => m.name)).toEqual(["O1", "O2", "O3"]);
  });

  it("keeps same-named cities in different states apart", () => {
    const out = clusterByCity([
      rec({ city: "Columbus", state: "OH" }),
      rec({ city: "Columbus", state: "GA" }),
    ]);
    expect(out).toHaveLength(2);
  });

  it("counts a dealer once per distinct city, not once per raw location entry", () => {
    // Same address written differently across brand sheets (incl. a city typo).
    const dup = rec({
      name: "Dup",
      locations: [
        loc("1405 E OAK", "Buffington", "TX", "75001"),
        loc("1405 EAST OAK STREET", "Buffinton", "TX", "75001-1234"),
        loc("1405 E. Oak St", "Buffington", "TX", "75001"),
      ],
    });
    const out = clusterByCity([dup]);
    expect(out).toHaveLength(1);
    expect(out[0].count).toBe(1);
    expect(out[0].members).toEqual([dup]);
  });

  it("counts a dealer once in a city even when several of its addresses are there", () => {
    const multi = rec({
      locations: [loc("1 Main St", "Orlando", "FL", "32801"), loc("900 Colonial Dr", "Orlando", "FL", "32803")],
    });
    const out = clusterByCity([multi, rec({ city: "Orlando", state: "FL" })]);
    expect(out).toHaveLength(1);
    expect(out[0].count).toBe(2);
    expect(out[0].members.filter((m) => m === multi)).toHaveLength(1);
  });

  it("places a genuinely multi-city dealer in each of its cities", () => {
    const chain = rec({
      name: "Chain",
      locations: [loc("1 A St", "Orlando", "FL", "32801"), loc("2 B St", "Dallas", "TX", "75201")],
    });
    const out = clusterByCity([chain]);
    expect(out.map((c) => `${c.city}|${c.state}`).sort()).toEqual(["Dallas|TX", "Orlando|FL"]);
    for (const c of out) expect(c.members).toEqual([chain]);
  });

  it("omits locations with no city or no state (they cannot be routed)", () => {
    const out = clusterByCity([rec({ city: "", state: "FL" }), rec({ city: "Orlando", state: "" })]);
    expect(out).toEqual([]);
  });

  it("breaks count ties deterministically by state then city", () => {
    const out = clusterByCity([
      rec({ city: "Tampa", state: "FL" }),
      rec({ city: "Austin", state: "TX" }),
      rec({ city: "Miami", state: "FL" }),
    ]);
    expect(out.map((c) => c.city)).toEqual(["Miami", "Tampa", "Austin"]);
  });
});

describe("unroutableDealers", () => {
  it("lists a blank-state record with a reason, and it is in no cluster", () => {
    const shifted = rec({ name: "Shifted", city: "1311 Price Plaza Dr", state: "" });
    const ok = rec({ name: "Ok", city: "Orlando", state: "FL" });
    const clusters = clusterByCity([shifted, ok]);
    const bad = unroutableDealers([shifted, ok]);
    expect(bad).toHaveLength(1);
    expect(bad[0].record).toBe(shifted);
    expect(bad[0].reason).toBe("missing state");
    expect(clusters.flatMap((c) => c.members)).not.toContain(shifted);
    // Reported as-is, never repaired.
    expect(shifted.state).toBe("");
    expect(shifted.locations[0].state).toBe("");
  });

  it("names which field failed: city, state, or both", () => {
    const out = unroutableDealers([
      rec({ name: "NoCity", city: "", state: "FL" }),
      rec({ name: "NoState", city: "Tampa", state: "" }),
      rec({ name: "Neither", city: "  ", state: " " }),
    ]);
    expect(out.map((o) => [o.record.name, o.reason])).toEqual([
      ["NoCity", "missing city"],
      ["NoState", "missing state"],
      ["Neither", "missing city and state"],
    ]);
  });

  it("does not flag a dealer with at least one routable location", () => {
    const mixed = rec({
      locations: [loc("1 A St", "", "FL", "32801"), loc("2 B St", "Dallas", "TX", "75201")],
    });
    expect(unroutableDealers([mixed])).toEqual([]);
    expect(clusterByCity([mixed]).map((c) => c.city)).toEqual(["Dallas"]);
  });

  it("partitions the input: every record is in a cluster or unroutable, never both, never neither", () => {
    const input = [
      rec({ name: "a", city: "Orlando", state: "FL" }),
      rec({ name: "b", city: "Orlando", state: "FL" }),
      rec({ name: "c", city: "Tampa", state: "FL" }),
      rec({ name: "d", city: "1311 Price Plaza Dr", state: "" }),
      rec({ name: "e", city: "", state: "TX" }),
      rec({ name: "f", city: "", state: "" }),
      rec({
        name: "chain",
        locations: [loc("1 A St", "Orlando", "FL", "32801"), loc("2 B St", "Dallas", "TX", "75201")],
      }),
    ];
    const clustered = new Set(clusterByCity(input).flatMap((c) => c.members));
    const unroutable = new Set(unroutableDealers(input).map((u) => u.record));
    for (const r of input) {
      expect(clustered.has(r) !== unroutable.has(r)).toBe(true);
    }
    expect(clustered.size + unroutable.size).toBe(input.length);
  });
});

describe("generic typing", () => {
  it("keeps lat/lng on cluster members without a cast", () => {
    const [geo] = attachCoordinates([rec({ city: "Orlando", state: "FL", dedupeKey: "k" })], [
      { dedupeKey: "k", lat: 28.5, lng: -81.4 },
    ]);
    const clusters = clusterByCity<GeoDealerRecord>([geo]);
    const m = clusters[0].members[0];
    // Compiles only if members are typed T, not DealerRecord.
    const lat: number | undefined = m.lat;
    expect(lat).toBe(28.5);
    expect(unroutableDealers<GeoDealerRecord>([])).toEqual([]);
  });
});

describe("milesFromHub", () => {
  it("computes miles from the Orlando hub within 1 mile of a known distance", () => {
    expect(milesFromHub(28.5383, -81.3792, "RHINO")).toBeCloseTo(0, 1);
    // Orlando to Tampa is roughly 80 miles in a straight line.
    const tampa = milesFromHub(27.9506, -82.4572, "RHINO");
    expect(tampa).toBeGreaterThan(75);
    expect(tampa).toBeLessThan(90);
  });

  it("measures from the Dallas hub for EVERFLOW", () => {
    expect(milesFromHub(32.8097, -96.875, "EVERFLOW")).toBeCloseTo(0, 1);
    // Dallas to Houston is roughly 225 miles in a straight line.
    const houston = milesFromHub(29.7604, -95.3698, "EVERFLOW");
    expect(houston).toBeGreaterThan(215);
    expect(houston).toBeLessThan(235);
  });

  it("matches the 3958.8-mile-radius haversine used by the existing collector", () => {
    // Dallas measured from the Orlando hub: independent computation, same radius.
    const R = 3958.8;
    const rad = (d: number) => (d * Math.PI) / 180;
    const dLat = rad(32.8097 - 28.5383);
    const dLng = rad(-96.875 + 81.3792);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(28.5383)) * Math.cos(rad(32.8097)) * Math.sin(dLng / 2) ** 2;
    const expected = 2 * R * Math.asin(Math.sqrt(a));
    expect(milesFromHub(32.8097, -96.875, "RHINO")).toBeCloseTo(expected, 6);
  });
});
