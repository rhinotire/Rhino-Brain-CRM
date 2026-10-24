import type { DealerRecord } from "./dealer-list-parse";

// Pure geography helpers for turning the dealer list into rep routes. No DB,
// no network, no I/O, no clock.

/**
 * A dealer record that may carry coordinates. DealerRecord itself has no
 * lat/lng (the five-brand workbook has none), so coordinates are an optional
 * overlay: a record without them simply has NO `lat`/`lng` keys. Never 0,0
 * (that is in the Atlantic and would corrupt every distance), never null.
 */
export type GeoDealerRecord = DealerRecord & { lat?: number; lng?: number };

export type CoordinateRow = { dedupeKey: string; lat: number; lng: number };

export type CityCluster<T extends DealerRecord = DealerRecord> = {
  city: string; // display form: first-seen spelling
  state: string; // upper-cased
  count: number; // distinct dealers in this city (== members.length)
  members: T[];
};

// Same constants the prospecting cron uses.
const HUBS = {
  RHINO: { lat: 28.5383, lng: -81.3792 }, // Orlando
  EVERFLOW: { lat: 32.8097, lng: -96.875 }, // Dallas
} as const;

const EARTH_RADIUS_MILES = 3958.8; // matches places-collector / geo

const rad = (deg: number): number => (deg * Math.PI) / 180;

/** Great-circle distance in miles from a point to a warehouse hub (haversine). */
export function milesFromHub(lat: number, lng: number, hub: "RHINO" | "EVERFLOW"): number {
  const h = HUBS[hub];
  const dLat = rad(lat - h.lat);
  const dLng = rad(lng - h.lng);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(h.lat)) * Math.cos(rad(lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(a)));
}

function usableCoordinate(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  // Null Island: a scraper's "no value" default, never a real dealer.
  if (lat === 0 && lng === 0) return false;
  return true;
}

/**
 * Merges coordinates onto records by dedupeKey. Records with no matching (or
 * only unusable) coordinate are returned as the very same object, untouched:
 * never dropped, never defaulted. Input arrays are not mutated. When a
 * dedupeKey appears more than once in `coords`, the first usable row wins.
 */
export function attachCoordinates(records: DealerRecord[], coords: CoordinateRow[]): GeoDealerRecord[] {
  const byKey = new Map<string, CoordinateRow>();
  for (const c of coords) {
    if (!c.dedupeKey) continue; // "" is "not dedupable", never a join key
    if (!usableCoordinate(c.lat, c.lng)) continue;
    if (!byKey.has(c.dedupeKey)) byKey.set(c.dedupeKey, c);
  }
  return records.map((r) => {
    const c = r.dedupeKey ? byKey.get(r.dedupeKey) : undefined;
    return c ? { ...r, lat: c.lat, lng: c.lng } : r;
  });
}

// ---- clustering ----

const STREET_TOKENS: Record<string, string> = {
  AVENUE: "AVE", ROAD: "RD", BOULEVARD: "BLVD", DRIVE: "DR", LANE: "LN",
  PARKWAY: "PKWY", PLACE: "PL", COURT: "CT", STREET: "ST",
  NORTH: "N", SOUTH: "S", EAST: "E", WEST: "W",
};
// Generic road-type words dropped for comparison only, so "1405 E OAK" and
// "1405 EAST OAK STREET" collapse to the same key.
const ROAD_TYPES = new Set(["ST", "AVE", "RD", "BLVD", "DR", "LN", "PKWY", "PL", "CT"]);
const UNIT_MARKERS = new Set(["STE", "SUITE", "UNIT", "APT", "BLDG", "FL", "FLOOR"]);

/** Comparison-only street form; never stored or displayed. */
function streetKey(street: string): string {
  const tokens = street
    .toUpperCase()
    .replace(/[.,]/g, "")
    .replace(/#/g, " # ")
    .split(/\s+/)
    .filter(Boolean);
  const out: string[] = [];
  for (const raw of tokens) {
    if (raw === "#" || UNIT_MARKERS.has(raw)) break; // drop unit/suite tail
    const t = STREET_TOKENS[raw] ?? raw;
    if (!ROAD_TYPES.has(t)) out.push(t);
  }
  return out.join(" ");
}

const cityKey = (city: string): string =>
  city.toUpperCase().replace(/[.,]/g, "").replace(/\s+/g, " ").trim();

const zip5 = (zip: string): string => zip.replace(/\D/g, "").slice(0, 5);

/** Why a single location cannot be routed, or null when it can. */
function locationProblem(l: DealerRecord["locations"][number]): string | null {
  const noCity = !l.city.trim();
  const noState = !l.state.trim();
  if (noCity && noState) return "missing city and state";
  if (noCity) return "missing city";
  if (noState) return "missing state";
  return null;
}

/**
 * The distinct cities a dealer physically occupies. Raw `locations` entries
 * overcount: ~292 records carry several entries that are one address written
 * differently across brand sheets (abbreviations, a city typo). Entries are
 * first collapsed to distinct addresses (same state + ZIP5 + normalised
 * street; city is part of the key only when ZIP is missing), keeping the first
 * spelling, and then reduced to distinct city|state pairs. Entries with no
 * city or no state cannot be routed and are skipped (see unroutableDealers).
 */
function distinctCities(r: DealerRecord): { city: string; state: string; key: string }[] {
  const seenAddress = new Set<string>();
  const seenCity = new Set<string>();
  const out: { city: string; state: string; key: string }[] = [];
  for (const l of r.locations) {
    if (locationProblem(l)) continue;
    const city = l.city.trim().replace(/\s+/g, " ");
    const state = l.state.trim().toUpperCase();
    const z = zip5(l.zip);
    const addressKey = [state, z || cityKey(city), streetKey(l.street)].join("|");
    // A blank street is "unknown", not "same address": don't let it swallow
    // distinct cities that happen to share a ZIP-less key.
    if (streetKey(l.street) && seenAddress.has(addressKey)) continue;
    seenAddress.add(addressKey);
    const key = `${cityKey(city)}|${state}`;
    if (seenCity.has(key)) continue;
    seenCity.add(key);
    out.push({ city, state, key });
  }
  return out;
}

/**
 * Groups dealers by distinct city+state, biggest cluster first (ties broken by
 * state then city for stable output). Each dealer is counted once per distinct
 * city it occupies, so a dealer with several spellings of one address is one
 * pin, while a genuine multi-city dealer appears in each of its cities.
 * Generic so callers passing GeoDealerRecord[] keep lat/lng on `members`.
 * Dealers with no routable location are not in any cluster; they are returned
 * by unroutableDealers, so the two together account for every input record.
 */
export function clusterByCity<T extends DealerRecord>(
  records: T[],
): CityCluster<T>[] {
  const clusters = new Map<string, CityCluster<T>>();
  for (const r of records) {
    for (const c of distinctCities(r)) {
      let cluster = clusters.get(c.key);
      if (!cluster) {
        cluster = { city: c.city, state: c.state, count: 0, members: [] };
        clusters.set(c.key, cluster);
      }
      cluster.members.push(r);
      cluster.count = cluster.members.length;
    }
  }
  return [...clusters.values()].sort(
    (a, b) => b.count - a.count || a.state.localeCompare(b.state) || a.city.localeCompare(b.city),
  );
}

/**
 * Dealers that clusterByCity cannot place: none of their locations has both a
 * city and a state (typically column-shifted rows such as city "1311 Price
 * Plaza Dr", state ""). Rows are reported as-is, NEVER repaired: fixing the
 * state is the importer's job, and repairing here would hide the shift.
 * `reason` names the failing field(s); a dealer with several unroutable
 * locations lists each distinct problem. Together with clusterByCity this
 * partitions the input: every record is in a cluster or in this list.
 */
export function unroutableDealers<T extends DealerRecord>(records: T[]): { record: T; reason: string }[] {
  const out: { record: T; reason: string }[] = [];
  for (const r of records) {
    if (r.locations.some((l) => !locationProblem(l))) continue;
    const reasons = [...new Set(r.locations.map((l) => locationProblem(l) as string))];
    out.push({ record: r, reason: reasons.length ? reasons.join("; ") : "no locations" });
  }
  return out;
}
