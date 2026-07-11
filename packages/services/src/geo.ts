import zipcodes from "zipcodes";

/** US ZIP validation + distance via the bundled ZCTA dataset (addendum #4 — no external API). */

export function isValidUsZip(zip: string): boolean {
  return /^\d{5}$/.test(zip.trim()) && !!zipcodes.lookup(zip.trim());
}

/** Distance in miles between two ZIPs; null when either is unknown. */
export function zipDistanceMiles(zipA: string, zipB: string): number | null {
  const d = zipcodes.distance(zipA.trim(), zipB.trim());
  return typeof d === "number" ? d : null;
}

export function zipCityState(zip: string): { city: string; state: string } | null {
  const hit = zipcodes.lookup(zip.trim());
  return hit ? { city: hit.city, state: hit.state } : null;
}
