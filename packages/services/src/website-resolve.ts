import { searchPlacesPage, type PlaceCandidate } from "./places-collector";

/**
 * Resolve a dealer's website through Google Places Text Search so that
 * prospect enrichment has something to fetch. Reuses `searchPlacesPage` from
 * places-collector (same endpoint, field mask and GOOGLE_PLACES_API_KEY).
 *
 * A wrong website is worse than none: it feeds enrichment, which feeds the
 * score, which decides whether a real dealer reaches a rep. So:
 *   - HIGH only when the top result's name AND city both match the dealer
 *     (and its state does not contradict it) and the URL is a real business
 *     site rather than a social/directory page;
 *   - LOW when the match is partial (name only, or city only) -- the URL Places
 *     returned is passed through so the caller can decide;
 *   - { website: null, LOW } when there are no hits, nothing in common with
 *     the dealer, or the matched place lists no website.
 * No URL is ever constructed or inferred -- only what Places returned.
 */

export type WebsiteResolution = { website: string | null; confidence: "HIGH" | "LOW" };

export type ResolveDeps = {
  /** Places client; defaults to the shared `searchPlacesPage`. Injected in tests. */
  search?: (opts: { query: string; apiKey: string }) => Promise<{ candidates: PlaceCandidate[] }>;
  /** Defaults to process.env.GOOGLE_PLACES_API_KEY. */
  apiKey?: string;
};

const NO_WEBSITE: WebsiteResolution = { website: null, confidence: "LOW" };

/** Legal/filler words that never distinguish one business from another. */
const NAME_STOPWORDS = new Set(["llc", "inc", "corp", "co", "company", "ltd", "the", "and"]);

/** Words common to most dealers in this trade -- not enough on their own to identify one. */
const GENERIC_WORDS = new Set([
  "tire", "tires", "wheel", "wheels", "rim", "rims", "auto", "automotive", "repair", "service", "services",
  "shop", "center", "centre", "custom", "customs", "truck", "trucks", "performance", "motorsports",
  "motorsport", "accessories", "offroad", "off", "road", "discount",
]);

const CITY_ABBREVIATIONS: Record<string, string> = { st: "saint", ft: "fort", mt: "mount" };

/** Hosts that are directories/social profiles, not the dealer's own site. */
const NON_SITE_HOSTS = [
  "facebook.com", "instagram.com", "yelp.com", "yellowpages.com", "mapquest.com", "twitter.com", "x.com",
  "linkedin.com", "tiktok.com", "linktr.ee", "bbb.org", "manta.com", "google.com",
];

const words = (s: string): string[] =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "") // strip combining accent marks left by NFKD
    .replace(/&/g, " and ")
    .replace(/['’`]/g, "") // joe's -> joes
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean);

const nameTokens = (s: string): string[] => words(s).filter((t) => !NAME_STOPWORDS.has(t));

/**
 * True when two business names are the same business: identical once
 * normalised, or one is the other plus extra words (all of the shorter name's
 * words appear in the longer) provided the shorter name carries at least one
 * distinctive word. "Auto Repair" must not match "Bob's Auto Repair".
 */
export function namesMatch(a: string, b: string): boolean {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (ta.length === 0 || tb.length === 0) return false;
  if (ta.join("") === tb.join("")) return true;
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const longSet = new Set(long);
  return short.every((t) => longSet.has(t)) && short.some((t) => !GENERIC_WORDS.has(t));
}

const cityKey = (s: string | null | undefined): string =>
  words(s ?? "").map((t) => CITY_ABBREVIATIONS[t] ?? t).join(" ");

/** True when two city names are the same city (case, punctuation and St./Ft./Mt. insensitive). */
export function citiesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const ka = cityKey(a);
  return ka !== "" && ka === cityKey(b);
}

/** The URL exactly as Places gave it, or null when it is not a usable http(s) URL. */
function cleanUrl(raw: string | null): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:" ? s : null;
  } catch {
    return null;
  }
}

function isNonSiteHost(url: string): boolean {
  const host = new URL(url).hostname.toLowerCase();
  return NON_SITE_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

export async function resolveWebsite(
  d: { name: string; city: string; state: string },
  deps: ResolveDeps = {},
): Promise<WebsiteResolution> {
  // Nothing identifiable to search for -- do not spend an API call on a guess.
  if (nameTokens(d.name).length === 0) return NO_WEBSITE;

  const apiKey = deps.apiKey ?? process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_PLACES_API_KEY is not set");
  const search = deps.search ?? searchPlacesPage;

  // API failures propagate: a 429 or bad key is not the same as "no website".
  const { candidates } = await search({ query: `"${d.name}" ${d.city} ${d.state}`, apiKey });
  const top = candidates[0]; // top result only
  if (!top) return NO_WEBSITE;

  const nameOk = namesMatch(d.name, top.companyName);
  const cityOk = citiesMatch(d.city, top.city);
  if (!nameOk && !cityOk) return NO_WEBSITE; // nothing in common: not even a partial match

  const website = cleanUrl(top.website);
  if (!website) return NO_WEBSITE;

  const stateContradicts =
    !!top.state && !!d.state.trim() && top.state.trim().toUpperCase() !== d.state.trim().toUpperCase();
  const high = nameOk && cityOk && !stateContradicts && !isNonSiteHost(website);
  return { website, confidence: high ? "HIGH" : "LOW" };
}
