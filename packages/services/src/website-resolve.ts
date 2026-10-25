import { searchPlacesPage, type PlaceCandidate } from "./places-collector";

/**
 * Resolve a dealer's website through Google Places Text Search so that
 * prospect enrichment has something to fetch. Reuses `searchPlacesPage` from
 * places-collector (same endpoint, field mask and GOOGLE_PLACES_API_KEY).
 *
 * A wrong website is worse than none: it feeds enrichment, which feeds the
 * score, which decides whether a real dealer reaches a rep. So:
 *   - HIGH only when the top result's name (strongly) AND city both match the
 *     dealer and both states are present and equal;
 *   - LOW with the Places URL when the name matches but certainty is partial
 *     (other city, name resting on one distinctive word, state unconfirmed) --
 *     it can be the same dealer or a branch, so the caller decides;
 *   - { website: null, LOW } when there are no hits, the name does not match
 *     (a city-only match is a different business), the matched place lists no
 *     website, or its URL is a social/directory page.
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
  "fb.com", "fb.me", "g.page", "goo.gl", "youtube.com", "nextdoor.com",
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

export const nameTokens = (s: string): string[] => words(s).filter((t) => !NAME_STOPWORDS.has(t));

export type NameMatch = "STRONG" | "WEAK" | "NONE";

/**
 * How well two business names identify the same business. Every match needs at
 * least one distinctive (non-generic) word, so "Tire Shop" or "Auto Repair"
 * never match anything, not even an identical name: those collide between
 * unrelated businesses.
 *   STRONG: identical once normalised, or one name is the other plus extra
 *           words and the shared words include two or more distinctive ones.
 *   WEAK:   containment resting on a single distinctive word ("Apex" vs
 *           "Apex Towing") -- plausible, but nothing here can rule out a
 *           different trade, so it must not be reported as HIGH.
 *   NONE:   anything else.
 */
export function nameMatchStrength(a: string, b: string): NameMatch {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (ta.length === 0 || tb.length === 0) return "NONE";
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const distinctive = short.filter((t) => !GENERIC_WORDS.has(t)).length;
  if (distinctive === 0) return "NONE";
  if (ta.join("") === tb.join("")) return "STRONG";
  const longSet = new Set(long);
  if (!short.every((t) => longSet.has(t))) return "NONE";
  return distinctive >= 2 ? "STRONG" : "WEAK";
}

/** True when two names match at any strength (see nameMatchStrength). */
export const namesMatch = (a: string, b: string): boolean => nameMatchStrength(a, b) !== "NONE";

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
  // A name with no distinctive word ("Tire Shop", blank) can never produce a
  // trustworthy match -- do not spend an API call on it.
  if (nameMatchStrength(d.name, d.name) === "NONE") return NO_WEBSITE;

  const apiKey = deps.apiKey ?? process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_PLACES_API_KEY is not set");
  const search = deps.search ?? searchPlacesPage;

  // API failures propagate: a 429 or bad key is not the same as "no website".
  // The name goes inside a quoted phrase, so a double quote in it (the workbook has plenty of punctuation)
  // would close the phrase early and quietly degrade the search after the call is paid for. Strip them.
  const phrase = d.name.replace(/"/g, "").replace(/\s+/g, " ").trim();
  const { candidates } = await search({ query: `"${phrase}" ${d.city} ${d.state}`, apiKey });
  const top = candidates[0]; // top result only
  if (!top) return NO_WEBSITE;

  // No name match means a different business (a city-only match is by
  // definition one), so there is no URL worth returning.
  const nameStrength = nameMatchStrength(d.name, top.companyName);
  if (nameStrength === "NONE") return NO_WEBSITE;

  const website = cleanUrl(top.website);
  if (!website) return NO_WEBSITE;
  // A social/directory page is neither scrapable nor the dealer's own site.
  if (isNonSiteHost(website)) return NO_WEBSITE;

  // HIGH needs a strong name, the same city, and both states present and equal
  // (a blank state could otherwise match a same-named city across a state line).
  const dealerState = d.state.trim().toUpperCase();
  const topState = (top.state ?? "").trim().toUpperCase();
  const statesAgree = dealerState !== "" && dealerState === topState;
  const high = nameStrength === "STRONG" && citiesMatch(d.city, top.city) && statesAgree;
  // Name matched but not with full certainty (other city, weak name, unconfirmed
  // state): could be the same dealer or a branch, so pass the URL at LOW.
  return { website, confidence: high ? "HIGH" : "LOW" };
}
