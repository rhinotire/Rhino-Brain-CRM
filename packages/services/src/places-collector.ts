/**
 * Google Places API (New) Text Search. One call = one page (<=20 places).
 * Docs: https://developers.google.com/maps/documentation/places/web-service/text-search
 */
export type PlaceCandidate = {
  companyName: string;
  phone: string | null;
  website: string | null;
  city: string | null;
  state: string | null;
  rating: number | null;
  ratingCount: number | null;
};

export const PLACES_COST_PER_CALL_USD = 0.032;

/** Circular search area, e.g. 50 miles around a warehouse. */
export type GeoCircle = { lat: number; lng: number; radiusMiles: number };

const milesBetween = (a: { lat: number; lng: number }, b: { lat: number; lng: number }): number => {
  const R = 3958.8; // earth radius, miles
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

type ApiPlace = {
  displayName?: { text?: string };
  nationalPhoneNumber?: string;
  websiteUri?: string;
  formattedAddress?: string;
  rating?: number;
  userRatingCount?: number;
  addressComponents?: Array<{ shortText?: string; types?: string[] }>;
  location?: { latitude?: number; longitude?: number };
};

export async function searchPlacesPage(opts: {
  query: string;
  apiKey: string;
  pageToken?: string;
  /** when set: results are restricted to the circle's bounding box, then
   * haversine-filtered to the exact radius */
  circle?: GeoCircle;
  fetchFn?: typeof fetch;
}): Promise<{ candidates: PlaceCandidate[]; nextPageToken: string | null }> {
  const f = opts.fetchFn ?? fetch;
  // Text Search only takes a rectangle restriction, so send the circle's
  // bounding box and trim the corners client-side afterwards.
  let locationRestriction: object | undefined;
  if (opts.circle) {
    const { lat, lng, radiusMiles } = opts.circle;
    const latDelta = radiusMiles / 69;
    const lngDelta = radiusMiles / (69.172 * Math.cos((lat * Math.PI) / 180));
    locationRestriction = {
      rectangle: {
        low: { latitude: lat - latDelta, longitude: lng - lngDelta },
        high: { latitude: lat + latDelta, longitude: lng + lngDelta },
      },
    };
  }
  const res = await f("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Goog-Api-Key": opts.apiKey,
      "X-Goog-FieldMask":
        "places.displayName,places.nationalPhoneNumber,places.websiteUri,places.formattedAddress,places.rating,places.userRatingCount,places.addressComponents,places.location,nextPageToken",
    },
    body: JSON.stringify({
      textQuery: opts.query, pageSize: 20,
      ...(locationRestriction ? { locationRestriction } : {}),
      ...(opts.pageToken ? { pageToken: opts.pageToken } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Places API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = (await res.json()) as { places?: ApiPlace[]; nextPageToken?: string };
  const comp = (p: ApiPlace, type: string) =>
    p.addressComponents?.find((c) => c.types?.includes(type))?.shortText ?? null;
  const inCircle = (p: ApiPlace): boolean => {
    if (!opts.circle) return true;
    if (typeof p.location?.latitude !== "number" || typeof p.location?.longitude !== "number") return true; // no coords — the rectangle already bounded it
    return milesBetween(opts.circle, { lat: p.location.latitude, lng: p.location.longitude }) <= opts.circle.radiusMiles;
  };
  return {
    candidates: (body.places ?? []).filter(inCircle).map((p) => ({
      companyName: p.displayName?.text ?? "",
      phone: p.nationalPhoneNumber ?? null,
      website: p.websiteUri ?? null,
      city: comp(p, "locality"),
      state: comp(p, "administrative_area_level_1"),
      rating: p.rating ?? null,
      ratingCount: p.userRatingCount ?? null,
    })).filter((c) => c.companyName),
    nextPageToken: body.nextPageToken ?? null,
  };
}
