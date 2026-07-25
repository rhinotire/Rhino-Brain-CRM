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

type ApiPlace = {
  displayName?: { text?: string };
  nationalPhoneNumber?: string;
  websiteUri?: string;
  formattedAddress?: string;
  rating?: number;
  userRatingCount?: number;
  addressComponents?: Array<{ shortText?: string; types?: string[] }>;
};

export async function searchPlacesPage(opts: {
  query: string;
  apiKey: string;
  pageToken?: string;
  fetchFn?: typeof fetch;
}): Promise<{ candidates: PlaceCandidate[]; nextPageToken: string | null }> {
  const f = opts.fetchFn ?? fetch;
  const res = await f("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Goog-Api-Key": opts.apiKey,
      "X-Goog-FieldMask":
        "places.displayName,places.nationalPhoneNumber,places.websiteUri,places.formattedAddress,places.rating,places.userRatingCount,places.addressComponents,nextPageToken",
    },
    body: JSON.stringify({ textQuery: opts.query, pageSize: 20, ...(opts.pageToken ? { pageToken: opts.pageToken } : {}) }),
  });
  if (!res.ok) throw new Error(`Places API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = (await res.json()) as { places?: ApiPlace[]; nextPageToken?: string };
  const comp = (p: ApiPlace, type: string) =>
    p.addressComponents?.find((c) => c.types?.includes(type))?.shortText ?? null;
  return {
    candidates: (body.places ?? []).map((p) => ({
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
