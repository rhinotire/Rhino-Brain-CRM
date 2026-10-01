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

export function zipLatLng(zip: string): { lat: number; lng: number } | null {
  const hit = zipcodes.lookup(zip.trim());
  return hit ? { lat: hit.latitude, lng: hit.longitude } : null;
}

type LatLng = { lat: number; lng: number };

function haversineMiles(a: LatLng, b: LatLng): number {
  const R = 3958.8;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * Order route stops to minimize driving (Field Mode): nearest-neighbor from
 * the start point, then 2-opt until stable. ZIP-centroid accuracy — plenty to
 * pick the store ORDER across a metro; the turn-by-turn stays Google's job.
 * Stops with an unknown ZIP keep their original relative order at the end.
 */
export function optimizeStopOrder(
  stops: { id: string; zip: string | null }[],
  start?: LatLng | null,
): { orderedIds: string[]; totalMiles: number | null } {
  const located = stops
    .map(s => ({ id: s.id, pt: s.zip ? zipLatLng(s.zip) : null }))
    .filter((s): s is { id: string; pt: LatLng } => !!s.pt);
  const unlocated = stops.filter(s => !located.some(l => l.id === s.id)).map(s => s.id);
  if (located.length < 2) return { orderedIds: [...located.map(l => l.id), ...unlocated], totalMiles: null };

  // nearest neighbor
  const origin = start ?? located[0].pt;
  const remaining = [...located];
  const route: typeof located = [];
  let cursor = origin;
  while (remaining.length) {
    let best = 0;
    for (let i = 1; i < remaining.length; i++) {
      if (haversineMiles(cursor, remaining[i].pt) < haversineMiles(cursor, remaining[best].pt)) best = i;
    }
    const next = remaining.splice(best, 1)[0];
    route.push(next);
    cursor = next.pt;
  }

  // 2-opt refinement (n ≤ ~10, cheap)
  const legLen = (r: typeof route) => {
    let d = haversineMiles(origin, r[0].pt);
    for (let i = 0; i < r.length - 1; i++) d += haversineMiles(r[i].pt, r[i + 1].pt);
    return d;
  };
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < route.length - 1; i++) {
      for (let j = i + 1; j < route.length; j++) {
        const candidate = [...route.slice(0, i), ...route.slice(i, j + 1).reverse(), ...route.slice(j + 1)];
        if (legLen(candidate) + 0.01 < legLen(route)) {
          route.splice(0, route.length, ...candidate);
          improved = true;
        }
      }
    }
  }

  return { orderedIds: [...route.map(r => r.id), ...unlocated], totalMiles: Math.round(legLen(route) * 10) / 10 };
}
