import { describe, it, expect } from "vitest";
import {
  shouldImport,
  locationForRecord,
  mergeIntoExisting,
  isNoopMerge,
  resolveGeo,
  cleanPhone,
  leadTypeFor,
  pickCoordinate,
  milesToHomeHub,
  tierForRecord,
  buildDensityIndex,
  densityOf,
  buildLeadIndex,
  matchExistingLead,
  buildNewLead,
  buildMeta,
  crossSellTaskFor,
  crossSellMarker,
  crossSellCustomerIdOf,
  crossSellBlockReason,
  crossSellBlacklisted,
  pickCrossSellCustomer,
  importBatchFigures,
  needsImportBatch,
  GOLF_CART_BRAND,
  HIGH_DENSITY_MIN,
  IMPORT_SOURCE,
  type LeadPlan,
} from "./dealer-import-rules";
import { countryFromState } from "./geo-state";
import { matchesExclusion, type ExclusionRow } from "./exclusion-service";
import { DEALER_SHEETS, type DealerRecord } from "./dealer-list-parse";
import { dedupeKeyFor } from "./prospect-dedupe";

// Fixture only. Country is derived from state as the parser does.
function rec(over: Partial<DealerRecord> = {}): DealerRecord {
  const state = over.state ?? "FL";
  const city = over.city ?? "Orlando";
  const name = over.name ?? "Test Wheels";
  const phone = over.phone ?? "407-555-0100";
  return {
    name,
    street: "1 Main St",
    city,
    state,
    zip: "32801",
    phone,
    email: "",
    website: "",
    brands: ["KG1 FORGED"],
    locations: [{ street: "1 Main St", city, state, zip: over.zip ?? "32801" }],
    country: countryFromState(state),
    dedupeKey: dedupeKeyFor({ phone, companyName: name, city }),
    ...over,
  };
}

const ids = { rhino: "loc-rhino", everflow: "loc-everflow", qingdao: "loc-qd" };

const plan = (over: Partial<LeadPlan> = {}): LeadPlan => ({
  tier: 4,
  locationId: ids.rhino,
  geo: { state: "FL", country: "US", repairedFromZip: false },
  milesFromHub: null,
  batchFile: "dealers.xlsx",
  ...over,
});

describe("shouldImport", () => {
  it("accepts a normal dealer", () => {
    expect(shouldImport(rec())).toEqual({ ok: true });
  });
  it("skips a non-dedupable record rather than writing an empty dedupeKey", () => {
    expect(shouldImport(rec({ dedupeKey: "" }))).toEqual({ ok: false, reason: "NON_DEDUPABLE" });
  });
  it("treats a null or undefined dedupeKey as non-dedupable too", () => {
    expect(shouldImport(rec({ dedupeKey: null as unknown as string }))).toEqual({ ok: false, reason: "NON_DEDUPABLE" });
    expect(shouldImport(rec({ dedupeKey: undefined as unknown as string }))).toEqual({ ok: false, reason: "NON_DEDUPABLE" });
  });
  it("blocks a blacklisted dealer from import", () => {
    expect(shouldImport(rec(), { blacklisted: true })).toEqual({ ok: false, reason: "BLACKLISTED" });
  });
  it("does not import an excluded dealer as a lead", () => {
    expect(shouldImport(rec(), { excluded: true })).toEqual({ ok: false, reason: "EXCLUDED" });
  });
  it("reports a blacklisted dealer as blacklisted even when it is also excluded and non-dedupable", () => {
    expect(shouldImport(rec({ dedupeKey: "" }), { blacklisted: true, excluded: true })).toEqual({
      ok: false,
      reason: "BLACKLISTED",
    });
  });
  it("leaves an already-existing lead alone", () => {
    expect(shouldImport(rec(), { alreadyLead: true })).toEqual({ ok: false, reason: "ALREADY_LEAD" });
  });
});

describe("locationForRecord", () => {
  it("gives a non-home US state a null locationId", () => {
    expect(locationForRecord(rec({ state: "MT" }), ids)).toBeNull();
  });
  it("routes home states to their own location", () => {
    expect(locationForRecord(rec({ state: "FL" }), ids)).toBe(ids.rhino);
    expect(locationForRecord(rec({ state: "TX" }), ids)).toBe(ids.everflow);
    expect(locationForRecord(rec({ state: "GA" }), ids)).toBe(ids.rhino);
    expect(locationForRecord(rec({ state: "LA" }), ids)).toBe(ids.everflow);
  });
  it("routes every Rhino and Everflow state", () => {
    for (const s of ["FL", "GA", "AL", "SC", "NC", "TN", "MS"]) expect(locationForRecord(rec({ state: s }), ids)).toBe(ids.rhino);
    for (const s of ["TX", "OK", "LA", "AR", "NM"]) expect(locationForRecord(rec({ state: s }), ids)).toBe(ids.everflow);
  });
  it("parks Canada with a null locationId: no rep (including the Qingdao rep) receives it", () => {
    expect(locationForRecord(rec({ state: "ON", zip: "M3J 2C2" }), ids)).toBeNull();
    expect(locationForRecord(rec({ state: "BC CANADA", zip: "V2T 6G1" }), ids)).toBeNull();
    expect(locationForRecord(rec({ state: "QC" }), ids)).toBeNull();
  });
  it("parks an unresolvable state unassigned instead of sending it to Qingdao", () => {
    expect(locationForRecord(rec({ state: "", zip: "" }), ids)).toBeNull();
  });
  it("is case- and whitespace-insensitive on the state", () => {
    expect(locationForRecord(rec({ state: " fl " }), ids)).toBe(ids.rhino);
  });
  it("returns null for a home state whose location id is not configured, never a wrong location", () => {
    expect(locationForRecord(rec({ state: "FL" }), { ...ids, rhino: null })).toBeNull();
  });
});

describe("resolveGeo (state repair via zip)", () => {
  it("recovers LAA + 70737 as Louisiana, an Everflow home state", () => {
    const d = rec({ state: "LAA", city: "gonzales", zip: "70737" });
    expect(resolveGeo(d)).toEqual({ state: "LA", country: "US", repairedFromZip: true });
    expect(locationForRecord(d, ids)).toBe(ids.everflow);
  });
  it("recovers a state from a ZIP+4", () => {
    expect(resolveGeo({ state: "Ml", zip: "48066-2757" })).toEqual({ state: "MI", country: "US", repairedFromZip: true });
  });
  it("recovers 'CA.' + 93313 as California", () => {
    expect(resolveGeo({ state: "CA.", zip: "93313" }).state).toBe("CA");
  });
  it("does NOT override a valid state with a mismatched ZIP", () => {
    // MT with a Florida ZIP is a typo in the ZIP, not a reason to move territory.
    expect(resolveGeo({ state: "MT", zip: "32801" })).toEqual({ state: "MT", country: "US", repairedFromZip: false });
  });
  it("leaves a garbled state unresolved when the ZIP is missing or not a US ZIP", () => {
    expect(resolveGeo({ state: "LAA", zip: "" }).country).toBe("OTHER");
    expect(resolveGeo({ state: "Ml", zip: "M3J 2C2" }).country).toBe("OTHER");
    expect(resolveGeo({ state: "XX", zip: "00000" }).country).toBe("OTHER");
  });
  it("treats an explicit CANADA as Canada, not a repairable typo", () => {
    expect(resolveGeo({ state: "CANADA", zip: "" }).country).toBe("CA");
  });
  it("does not touch a valid Canadian province", () => {
    expect(resolveGeo({ state: "ON", zip: "M3J 2C2" })).toEqual({ state: "ON", country: "CA", repairedFromZip: false });
  });
});

describe("cleanPhone", () => {
  it("nulls non-numeric junk", () => {
    expect(cleanPhone("NOT OPEN TO PUBLIC")).toBeNull();
  });
  it("nulls anything under 10 digits", () => {
    expect(cleanPhone("555-1234")).toBeNull();
    expect(cleanPhone("123456789")).toBeNull();
  });
  it("keeps a real number exactly as listed", () => {
    expect(cleanPhone("(205)491-0010")).toBe("(205)491-0010");
    expect(cleanPhone("  256-324-2528 ")).toBe("256-324-2528");
  });
  it("nulls blanks and nullish", () => {
    expect(cleanPhone("")).toBeNull();
    expect(cleanPhone(undefined)).toBeNull();
    expect(cleanPhone(null)).toBeNull();
  });
});

describe("leadTypeFor", () => {
  it("is WHEEL_SHOP for a normal dealer", () => {
    expect(leadTypeFor({ brands: ["KG1 FORGED"] })).toBe("WHEEL_SHOP");
  });
  it("is ATV_GOLF when the golf-cart sheet is the only brand", () => {
    expect(leadTypeFor({ brands: [GOLF_CART_BRAND] })).toBe("ATV_GOLF");
  });
  it("stays WHEEL_SHOP when the dealer also carries a wheel brand", () => {
    expect(leadTypeFor({ brands: ["FUEL OFF-ROAD", GOLF_CART_BRAND] })).toBe("WHEEL_SHOP");
  });
  it("uses the real sheet name from the parser", () => {
    expect(GOLF_CART_BRAND).toBe(DEALER_SHEETS[4]);
  });
});

describe("pickCoordinate / milesToHomeHub", () => {
  const tampa = { city: "TAMPA", state: "FL", zip: "33602", lat: 27.95, lng: -82.46 };
  const keyWest = { city: "KEY WEST", state: "FL", zip: "33040", lat: 24.55, lng: -81.78 };

  it("picks the candidate for the TOP-LEVEL city, not the first branch", () => {
    const d = rec({ city: "Key West", state: "FL", zip: "33040" });
    expect(pickCoordinate(d, [tampa, keyWest])).toEqual({ lat: 24.55, lng: -81.78 });
  });
  it("returns null rather than another branch's coordinate when the top-level city has none", () => {
    const d = rec({ city: "Miami", state: "FL", zip: "33101" });
    expect(pickCoordinate(d, [tampa, keyWest])).toBeNull();
  });
  it("requires the state to match too", () => {
    const d = rec({ city: "Tampa", state: "GA", zip: "30301" });
    expect(pickCoordinate(d, [tampa])).toBeNull();
  });
  it("matches city case- and punctuation-insensitively", () => {
    const d = rec({ city: "tampa.", state: "fl" });
    expect(pickCoordinate(d, [tampa])).not.toBeNull();
  });
  it("measures a home dealer from the hub using the record's coordinate", () => {
    const d = { ...rec({ city: "Tampa", state: "FL", zip: "33602" }), lat: 27.95, lng: -82.46 };
    const miles = milesToHomeHub(d, "FL");
    expect(miles).toBeGreaterThan(60);
    expect(miles).toBeLessThan(110);
  });
  it("falls back to the top-level ZIP centroid when allowed", () => {
    const d = rec({ city: "Tampa", state: "FL", zip: "33602" });
    expect(milesToHomeHub(d, "FL")).toBeNull();
    const miles = milesToHomeHub(d, "FL", { zipCentroid: true });
    expect(miles).toBeGreaterThan(60);
    expect(miles).toBeLessThan(110);
  });
  it("rejects a ZIP centroid from a different state than the one routed on", () => {
    const d = rec({ state: "TX", zip: "32801" }); // Orlando ZIP on a Texas record
    expect(milesToHomeHub(d, "TX", { zipCentroid: true })).toBeNull();
  });
  it("is null for a non-home state (distance is never used for them)", () => {
    const d = { ...rec({ state: "MT" }), lat: 46.8, lng: -110.4 };
    expect(milesToHomeHub(d, "MT", { zipCentroid: true })).toBeNull();
  });
});

describe("tierForRecord", () => {
  const geoOf = (state: string) => resolveGeo({ state, zip: "" });

  it("uses the distance option: a home single-brand dealer within 150 miles is tier 3, not 4", () => {
    expect(tierForRecord(rec(), geoOf("FL"), { milesFromHub: 80 })).toBe(3);
    expect(tierForRecord(rec(), geoOf("FL"), { milesFromHub: 400 })).toBe(4);
    expect(tierForRecord(rec(), geoOf("FL"), { milesFromHub: null })).toBe(4);
  });
  it("ranks a home multi-brand dealer tier 2", () => {
    expect(tierForRecord(rec({ brands: ["A", "B"] }), geoOf("TX"))).toBe(2);
  });
  it("passes the existing-customer flag through (tier 1)", () => {
    expect(tierForRecord(rec(), geoOf("FL"), { isExistingCustomer: true })).toBe(1);
  });
  it("assigns tier 6 to a non-home dealer in a dense city that tierFor would call 7", () => {
    expect(tierForRecord(rec({ state: "NY" }), geoOf("NY"), { density: HIGH_DENSITY_MIN })).toBe(6);
    expect(tierForRecord(rec({ state: "NY" }), geoOf("NY"), { density: HIGH_DENSITY_MIN - 1 })).toBe(7);
  });
  it("does not demote a 3+ brand non-home dealer (tier 5) into tier 6", () => {
    expect(tierForRecord(rec({ state: "NY", brands: ["A", "B", "C"] }), geoOf("NY"), { density: 50 })).toBe(5);
  });
  it("never makes a home or Canadian dealer tier 6, however dense", () => {
    expect(tierForRecord(rec({ state: "FL" }), geoOf("FL"), { density: 50 })).toBe(4);
    expect(tierForRecord(rec({ state: "ON" }), geoOf("ON"), { density: 50 })).toBe(8);
  });
  it("ranks on the repaired state: LAA + 70737 is an Everflow home dealer (tier 4), not tier 8", () => {
    const d = rec({ state: "LAA", city: "gonzales", zip: "70737", brands: ["A"] });
    expect(tierForRecord(d, resolveGeo(d))).toBe(4);
  });
  it("parks an unresolvable state at tier 8", () => {
    const d = rec({ state: "", zip: "" });
    expect(tierForRecord(d, resolveGeo(d))).toBe(8);
  });
});

describe("buildDensityIndex", () => {
  it("counts dealers per distinct city", () => {
    const rs = [
      rec({ name: "A Wheels", city: "Buffalo", state: "NY", phone: "716-555-0001" }),
      rec({ name: "B Wheels", city: "BUFFALO", state: "NY", phone: "716-555-0002" }),
      rec({ name: "C Wheels", city: "Albany", state: "NY", phone: "518-555-0003" }),
    ];
    const idx = buildDensityIndex(rs);
    expect(densityOf(rs[0], idx)).toBe(2);
    expect(densityOf(rs[2], idx)).toBe(1);
    expect(densityOf(rec({ city: "Nowhere", state: "ZZ" }), idx)).toBe(1);
  });
});

describe("matchExistingLead", () => {
  const imported = { id: "L1", companyName: "Test Wheels", phone: null, city: null, dedupeKey: "p:4075550100", meta: { importSource: IMPORT_SOURCE } };
  const foreign = { id: "L2", companyName: "Other Co", phone: null, city: null, dedupeKey: "p:4075550200", meta: { website: "x.com" } };

  it("returns UPDATE for a lead this importer wrote", () => {
    const m = matchExistingLead(rec({ dedupeKey: "p:4075550100" }), buildLeadIndex([imported]));
    expect(m).toEqual({ kind: "UPDATE", lead: imported });
  });
  it("returns SKIP, never UPDATE, for another source's lead with the same dedupeKey", () => {
    expect(matchExistingLead(rec({ dedupeKey: "p:4075550200" }), buildLeadIndex([foreign]))).toEqual({ kind: "SKIP", via: "dedupeKey" });
  });
  it("matches an existing lead by website domain", () => {
    const idx = buildLeadIndex([{ id: "L3", companyName: "Zed", phone: null, city: null, dedupeKey: "d:acme.com", meta: null }]);
    expect(matchExistingLead(rec({ website: "https://www.acme.com/dealers" }), idx)).toEqual({ kind: "SKIP", via: "domain" });
  });
  it("matches by phone and by name+city", () => {
    const idx = buildLeadIndex([
      { id: "L4", companyName: "Zed", phone: "(321) 555-9999", city: null, dedupeKey: null, meta: null },
      { id: "L5", companyName: "Brightside Customs", phone: null, city: "Ocala", dedupeKey: null, meta: null },
    ]);
    expect(matchExistingLead(rec({ phone: "321.555.9999", dedupeKey: "p:3215559999" }), idx)).toEqual({ kind: "SKIP", via: "phone" });
    expect(matchExistingLead(rec({ name: "Brightside Customs", city: "Ocala", phone: "", dedupeKey: "n:x" }), idx)).toEqual({ kind: "SKIP", via: "name+city" });
  });
  it("returns null for a genuinely new dealer", () => {
    const fresh = rec({ name: "Brand New Dealer", phone: "407-555-0999", dedupeKey: "p:4075550999" });
    expect(matchExistingLead(fresh, buildLeadIndex([imported, foreign]))).toBeNull();
  });
  it("never joins on an empty dedupeKey", () => {
    const idx = buildLeadIndex([{ id: "L6", companyName: "Q", phone: null, city: null, dedupeKey: "", meta: null }]);
    expect(matchExistingLead(rec({ dedupeKey: "", phone: "", name: "Zzzz", website: "" }), idx)).toBeNull();
  });
});

describe("buildNewLead", () => {
  it("writes the required fields", () => {
    const d = rec({ email: " a@b.com ", website: "acme.com", brands: ["A", "B"] });
    const lead = buildNewLead(d, plan({ tier: 2 }));
    expect(lead).toMatchObject({
      companyName: "Test Wheels",
      source: "PROSPECTING",
      stage: "NEW_LEAD",
      type: "WHEEL_SHOP",
      locationId: ids.rhino,
      email: "a@b.com",
      dedupeKey: d.dedupeKey,
    });
    expect(lead.meta).toMatchObject({ brands: ["A", "B"], brandCount: 2, tier: 2, website: "acme.com", importSource: IMPORT_SOURCE });
  });
  it("nulls a junk phone and writes the repaired state", () => {
    const d = rec({ phone: "NOT OPEN TO PUBLIC", state: "LAA", zip: "70737", city: "gonzales" });
    const lead = buildNewLead(d, plan({ geo: resolveGeo(d), locationId: ids.everflow }));
    expect(lead.phone).toBeNull();
    expect(lead.state).toBe("LA");
    expect(lead.country).toBe("US");
    expect(lead.meta.stateRepairedFromZip).toEqual({ was: "LAA", now: "LA" });
  });
  it("writes a normalised state for a recognised one and null for junk", () => {
    const st = (state: string, zip = "") => {
      const d = rec({ state, zip });
      return buildNewLead(d, plan({ geo: resolveGeo(d) })).state;
    };
    expect(st("fl")).toBe("FL");
    expect(st(" tx ")).toBe("TX");
    expect(st("ON", "M3J 2C2")).toBe("ON");
    expect(st("BC CANADA", "V2T 6G1")).toBeNull();
    expect(st("817")).toBeNull();
    expect(st("")).toBeNull();
    expect(st("LAA")).toBeNull(); // no zip to repair from
  });
  it("keeps a non-home dealer's locationId null", () => {
    expect(buildNewLead(rec({ state: "MT" }), plan({ locationId: null })).locationId).toBeNull();
  });
  it("tags a golf-cart-only dealer ATV_GOLF", () => {
    expect(buildNewLead(rec({ brands: [GOLF_CART_BRAND] }), plan()).type).toBe("ATV_GOLF");
  });
  it("records extra branches in meta only when there are several", () => {
    const one = buildMeta(rec(), plan());
    expect("locations" in one).toBe(false);
    const multi = rec({
      locations: [
        { street: "1", city: "Orlando", state: "FL", zip: "32801" },
        { street: "2", city: "Tampa", state: "FL", zip: "33602" },
      ],
    });
    expect((buildMeta(multi, plan()).locations as unknown[]).length).toBe(2);
  });
});

describe("mergeIntoExisting", () => {
  it("treats an existing dedupeKey as an update that preserves assignedRepId", () => {
    expect(mergeIntoExisting({ assignedRepId: "rep-1" }, rec()).assignedRepId).toBe("rep-1");
    expect(mergeIntoExisting({ assignedRepId: "rep-1" }, rec(), plan()).assignedRepId).toBe("rep-1");
  });
  it("preserves an unclaimed lead as unclaimed", () => {
    expect(mergeIntoExisting({ assignedRepId: null }, rec(), plan()).assignedRepId).toBeNull();
  });
  it("only fills EMPTY columns; a rep's edits win", () => {
    const d = rec({ email: "list@x.com" });
    const merged = mergeIntoExisting(
      { assignedRepId: "rep-1", phone: "rep-typed", email: null, city: "", state: "FL", locationId: null, meta: {} },
      d,
      plan(),
    );
    expect(merged.phone).toBeUndefined();
    expect(merged.state).toBeUndefined();
    expect(merged.email).toBe("list@x.com");
    expect(merged.city).toBe("Orlando");
    expect(merged.locationId).toBe(ids.rhino);
  });
  it("never touches stage, type, source, notes", () => {
    const merged = mergeIntoExisting({ assignedRepId: "r", meta: {} }, rec(), plan());
    for (const k of ["stage", "type", "source", "notes", "importBatchId", "dedupeKey"]) expect(k in merged).toBe(false);
  });
  it("keeps existing meta keys and a website already stored", () => {
    const merged = mergeIntoExisting(
      { assignedRepId: null, meta: { website: "rep-found.com", contacts: [{ name: "Joe" }] } },
      rec({ website: "list.com" }),
      plan({ tier: 2 }),
    );
    const meta = merged.meta as Record<string, unknown>;
    expect(meta.website).toBe("rep-found.com");
    expect(meta.contacts).toEqual([{ name: "Joe" }]);
    expect(meta.tier).toBe(2);
  });
  it("is a no-op when re-run against the row it just wrote (idempotent), even with reordered jsonb keys", () => {
    const d = rec({ website: "acme.com", brands: ["A", "B"] });
    const p = plan({ tier: 2 });
    const created = buildNewLead(d, p);
    // Postgres jsonb returns keys in a different order than they were written.
    const meta = Object.fromEntries(Object.entries(created.meta).reverse());
    const merged = mergeIntoExisting({ assignedRepId: null, ...created, meta }, d, p);
    expect(isNoopMerge(merged)).toBe(true);
  });
  it("refreshes the tier when it changed", () => {
    const d = rec();
    const created = buildNewLead(d, plan({ tier: 4 }));
    const merged = mergeIntoExisting({ assignedRepId: null, ...created }, d, plan({ tier: 3 }));
    expect(isNoopMerge(merged)).toBe(false);
    expect((merged.meta as Record<string, unknown>).tier).toBe(3);
  });
});

describe("crossSellTaskFor", () => {
  const customer = { id: "cust-1", companyName: "Acme Wheels", assignedRepId: "rep-1", locationId: "loc-rhino" };
  const record = rec();

  it("builds a cross-sell task naming the brands the customer carries", () => {
    const t = crossSellTaskFor(customer, { ...record, brands: ["FUEL OFF-ROAD", "KG1 FORGED"] });
    expect(t).not.toBeNull();
    expect(t!.title).toContain("FUEL OFF-ROAD");
    expect(t!.assigneeId).toBe(customer.assignedRepId);
  });
  it("creates no task for a blacklisted customer", () => {
    expect(crossSellTaskFor(customer, record, { blacklisted: true })).toBeNull();
  });
  it("creates no task when the customer has no assigned rep", () => {
    expect(crossSellTaskFor({ ...customer, assignedRepId: null }, record)).toBeNull();
  });
  it("creates no task when the assigned rep id is an empty string", () => {
    expect(crossSellTaskFor({ ...customer, assignedRepId: "" }, record)).toBeNull();
  });
  it("fills every required Task column: due in 7 days, customer, location, creator", () => {
    const now = new Date("2026-10-24T12:00:00.000Z");
    const t = crossSellTaskFor(customer, record, { now, creatorId: "admin-1" })!;
    expect(t.dueDate.toISOString()).toBe("2026-10-31T12:00:00.000Z");
    expect(t.customerId).toBe("cust-1");
    expect(t.locationId).toBe("loc-rhino");
    expect(t.creatorId).toBe("admin-1");
    expect(t.priority).toBe("MEDIUM");
    expect(t.type).toBe("FOLLOW_UP");
    expect("status" in t).toBe(false);
  });
  it("defaults the creator to the assigned rep when none is given", () => {
    expect(crossSellTaskFor(customer, record)!.creatorId).toBe("rep-1");
  });
  it("keys the marker on the CUSTOMER id and puts it alone on the first line", () => {
    const t = crossSellTaskFor(customer, record)!;
    expect(t.description.split("\n", 1)[0]).toBe(crossSellMarker("cust-1"));
    expect(crossSellMarker("cust-1")).toBe("[dealer-xsell:cust-1]");
  });
  it("gives two different dealer records for one customer the SAME marker (one nudge per account)", () => {
    const a = crossSellTaskFor(customer, rec({ name: "Branch A", phone: "407-555-0111" }))!;
    const b = crossSellTaskFor(customer, rec({ name: "Branch B", phone: "407-555-0122", dedupeKey: "" }))!;
    expect(a.description.split("\n", 1)[0]).toBe(b.description.split("\n", 1)[0]);
  });
  it("gives two different customers different markers", () => {
    expect(crossSellMarker("cust-1")).not.toBe(crossSellMarker("cust-2"));
  });
  it("keeps the dealer's dedupeKey in the description body for provenance, not on line 1", () => {
    const t = crossSellTaskFor(customer, record)!;
    expect(t.description).toContain(record.dedupeKey);
    expect(t.description.split("\n", 1)[0]).not.toContain(record.dedupeKey);
  });
  it("still produces a sensible task when the list recorded no brands", () => {
    const t = crossSellTaskFor(customer, { ...record, brands: [] })!;
    expect(t.title).toContain("Acme Wheels");
    expect(t.description).toContain("No brands recorded");
  });
});

describe("crossSellCustomerIdOf", () => {
  it("reads the customer id back from a task the importer wrote (round trip)", () => {
    const t = crossSellTaskFor({ id: "cust-9", companyName: "Z", assignedRepId: "rep-1", locationId: "l" }, rec())!;
    expect(crossSellCustomerIdOf(t.description)).toBe("cust-9");
  });
  it("returns null for descriptions that are not cross-sell markers", () => {
    expect(crossSellCustomerIdOf(null)).toBeNull();
    expect(crossSellCustomerIdOf("")).toBeNull();
    expect(crossSellCustomerIdOf("call them back")).toBeNull();
    expect(crossSellCustomerIdOf("[dealer-xsell:]")).toBeNull();
    expect(crossSellCustomerIdOf("call them\n[dealer-xsell:cust-1]")).toBeNull();
  });
});

describe("pickCrossSellCustomer", () => {
  const noRep = { id: "a", assignedRepId: null };
  const owned = { id: "b", assignedRepId: "rep-1" };
  const owned2 = { id: "c", assignedRepId: "rep-2" };
  it("prefers the rep-owned customer when the phone hit has no rep", () => {
    expect(pickCrossSellCustomer(noRep, owned)).toBe(owned);
  });
  it("keeps the phone hit when both are owned (phone wins ties)", () => {
    expect(pickCrossSellCustomer(owned, owned2)).toBe(owned);
  });
  it("keeps the phone hit when it is owned and the domain hit is not", () => {
    expect(pickCrossSellCustomer(owned, noRep)).toBe(owned);
  });
  it("falls back to whichever side exists", () => {
    expect(pickCrossSellCustomer(noRep, undefined)).toBe(noRep);
    expect(pickCrossSellCustomer(undefined, owned)).toBe(owned);
    expect(pickCrossSellCustomer(undefined, undefined)).toBeUndefined();
  });
});

describe("crossSellBlockReason", () => {
  const ok = { id: "c1", companyName: "Acme", assignedRepId: "rep-1", locationId: "loc-rhino", status: "ACTIVE" };
  const rep = { active: true, locationId: "loc-rhino" };
  it("allows an active customer whose active rep sits in the customer's location", () => {
    expect(crossSellBlockReason(ok, rep)).toBeNull();
  });
  it("allows a customer with no status field (older callers)", () => {
    const { status: _s, ...noStatus } = ok;
    expect(crossSellBlockReason(noStatus, rep)).toBeNull();
  });
  it.each(["DO_NOT_CONTACT", "LOST", "INACTIVE"])("blocks a %s customer", (status) => {
    expect(crossSellBlockReason({ ...ok, status }, rep)).toBe("BAD_STATUS");
  });
  it.each(["ACTIVE", "LEAD", "PROSPECT"])("does not block a %s customer", (status) => {
    expect(crossSellBlockReason({ ...ok, status }, rep)).toBeNull();
  });
  it("blocks a customer with no rep", () => {
    expect(crossSellBlockReason({ ...ok, assignedRepId: null }, rep)).toBe("NO_REP");
  });
  it("blocks a customer with no location (never falls back to the rep's)", () => {
    expect(crossSellBlockReason({ ...ok, locationId: null }, rep)).toBe("NO_CUSTOMER_LOCATION");
  });
  it("blocks an inactive rep, and a rep with no user row", () => {
    expect(crossSellBlockReason(ok, { active: false, locationId: "loc-rhino" })).toBe("REP_INACTIVE");
    expect(crossSellBlockReason(ok, undefined)).toBe("REP_INACTIVE");
  });
  it("blocks a rep whose location differs from the customer's (task would be invisible on /tasks)", () => {
    expect(crossSellBlockReason(ok, { active: true, locationId: "loc-everflow" })).toBe("REP_LOCATION_MISMATCH");
    expect(crossSellBlockReason(ok, { active: true, locationId: null })).toBe("REP_LOCATION_MISMATCH");
  });
  it("reports a bad status before any rep problem", () => {
    expect(crossSellBlockReason({ ...ok, status: "DO_NOT_CONTACT", assignedRepId: null }, undefined)).toBe("BAD_STATUS");
  });
});

describe("crossSellBlacklisted", () => {
  // A name-only blacklist row: it matches a candidate only on an equal company name.
  const rows: ExclusionRow[] = [{ kind: "BLACKLIST", companyName: "Best Tire Depot", domain: null, phone: null }];
  const matcher = (c: { companyName?: string | null; website?: string | null; phone?: string | null }) => matchesExclusion(c, rows);
  const dealer = rec({ name: "1 Beat Tires Depot & Autocare Inc", phone: "817-555-0100", website: "" });
  const bestTire = { companyName: "BEST TIRE DEPOT", website: null, phone: "817-555-0100" };

  it("does NOT catch a name-only blacklisted customer from the dealer identity alone (the defect)", () => {
    expect(!!matcher({ companyName: dealer.name, website: dealer.website, phone: dealer.phone })).toBe(false);
  });
  it("catches it once the resolved customer's own identity is checked", () => {
    expect(crossSellBlacklisted(dealer, bestTire, matcher)).toBe(true);
  });
  it("still catches a blacklist hit on the dealer's identity when there is no customer", () => {
    expect(crossSellBlacklisted(rec({ name: "Best Tire Depot" }), undefined, matcher)).toBe(true);
  });
  it("passes a dealer and customer that match nothing", () => {
    expect(crossSellBlacklisted(dealer, { companyName: "Other Co", website: null, phone: null }, matcher)).toBe(false);
  });
  it("feeds the pure guard: a blacklisted customer yields no task", () => {
    const cust = { id: "c", companyName: "BEST TIRE DEPOT", assignedRepId: "rep-1", locationId: "l" };
    const blacklisted = crossSellBlacklisted(dealer, bestTire, matcher);
    expect(crossSellTaskFor(cust, dealer, { blacklisted })).toBeNull();
  });
});

// ---- the ImportBatch row's arithmetic (final review F3) ----------------------------------

describe("importBatchFigures", () => {
  it("counts CREATES only as successful: an update keeps the batch id its lead was first imported under", () => {
    // A mixed re-run: 10 new leads carry this batch's id, the 5 updated ones keep the old batch's.
    expect(importBatchFigures({ created: 10, createFailed: 0, updated: 5, updateFailed: 0 })).toEqual({ successful: 10, failed: 0 });
  });

  it("an update-only run has nothing to record as successful", () => {
    expect(importBatchFigures({ created: 0, createFailed: 0, updated: 7, updateFailed: 0 }).successful).toBe(0);
  });

  it("reports every failure, create or update, in failed", () => {
    expect(importBatchFigures({ created: 8, createFailed: 2, updated: 3, updateFailed: 1 })).toEqual({ successful: 8, failed: 3 });
  });
});

describe("needsImportBatch", () => {
  it("is false when no lead will be created: a batch row with zero leads makes reconcile report NO DATA for real work", () => {
    expect(needsImportBatch(0)).toBe(false);
  });
  it("is true when at least one lead will be created", () => {
    expect(needsImportBatch(1)).toBe(true);
    expect(needsImportBatch(5001)).toBe(true);
  });
});
