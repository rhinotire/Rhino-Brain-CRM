import { describe, expect, it, vi } from "vitest";
import { resolveWebsite, namesMatch, citiesMatch } from "./website-resolve";
import type { PlaceCandidate } from "./places-collector";

const cand = (over: Partial<PlaceCandidate>): PlaceCandidate => ({
  companyName: "Lone Star Wheel & Tire",
  phone: null,
  website: "https://lonestarwheel.com/",
  city: "Dallas",
  state: "TX",
  rating: null,
  ratingCount: null,
  ...over,
});

/** Mocked Places client — the suite never touches the network. */
const clientReturning = (...candidates: PlaceCandidate[]) =>
  vi.fn(async (_opts: { query: string; apiKey: string }) => ({ candidates, nextPageToken: null }));

const dealer = { name: "Lone Star Wheel & Tire", city: "Dallas", state: "TX" };

describe("resolveWebsite", () => {
  it("returns the website when the top hit's name and city both match", async () => {
    const search = clientReturning(cand({}));
    const r = await resolveWebsite(dealer, { search, apiKey: "k" });
    expect(r).toEqual({ website: "https://lonestarwheel.com/", confidence: "HIGH" });
  });

  it("returns LOW confidence when only the city matches", async () => {
    const search = clientReturning(cand({ companyName: "Totally Different Motors", website: "https://other.example/" }));
    const r = await resolveWebsite(dealer, { search, apiKey: "k" });
    expect(r.confidence).toBe("LOW");
    expect(r.website).toBe("https://other.example/");
  });

  it("returns LOW confidence when only the name matches", async () => {
    const search = clientReturning(cand({ city: "Houston" }));
    const r = await resolveWebsite(dealer, { search, apiKey: "k" });
    expect(r).toEqual({ website: "https://lonestarwheel.com/", confidence: "LOW" });
  });

  it("returns null rather than guessing when neither name nor city match", async () => {
    const search = clientReturning(cand({ companyName: "Totally Different Motors", city: "Houston" }));
    const r = await resolveWebsite(dealer, { search, apiKey: "k" });
    expect(r).toEqual({ website: null, confidence: "LOW" });
  });

  it("returns null rather than guessing when there are no hits", async () => {
    const search = clientReturning();
    await expect(
      resolveWebsite({ name: "Nonexistent", city: "Nowhere", state: "ZZ" }, { search, apiKey: "k" }),
    ).resolves.toEqual({ website: null, confidence: "LOW" });
  });

  it("returns null with LOW when the matching place has no website listed", async () => {
    const search = clientReturning(cand({ website: null }));
    const r = await resolveWebsite(dealer, { search, apiKey: "k" });
    expect(r).toEqual({ website: null, confidence: "LOW" });
  });

  it("judges only the top result, never a lower-ranked better match", async () => {
    const search = clientReturning(
      cand({ companyName: "Totally Different Motors", city: "Houston", website: "https://wrong.example/" }),
      cand({}),
    );
    const r = await resolveWebsite(dealer, { search, apiKey: "k" });
    expect(r).toEqual({ website: null, confidence: "LOW" });
  });

  it("queries Places with the quoted name, then city and state", async () => {
    const search = clientReturning();
    await resolveWebsite(dealer, { search, apiKey: "secret" });
    expect(search).toHaveBeenCalledTimes(1);
    const arg = search.mock.calls[0]![0];
    expect(arg.query).toBe('"Lone Star Wheel & Tire" Dallas TX');
    expect(arg.apiKey).toBe("secret");
  });

  it("is not HIGH when the state contradicts, even if name and city match", async () => {
    const search = clientReturning(cand({ state: "OK" }));
    const r = await resolveWebsite(dealer, { search, apiKey: "k" });
    expect(r.confidence).toBe("LOW");
  });

  it("is not HIGH when the website is a social or directory page", async () => {
    const search = clientReturning(cand({ website: "https://www.facebook.com/lonestarwheel" }));
    const r = await resolveWebsite(dealer, { search, apiKey: "k" });
    expect(r.confidence).toBe("LOW");
  });

  it("drops a website that is not a valid http(s) URL instead of passing it on", async () => {
    const search = clientReturning(cand({ website: "javascript:alert(1)" }));
    const r = await resolveWebsite(dealer, { search, apiKey: "k" });
    expect(r).toEqual({ website: null, confidence: "LOW" });
  });

  it("makes no API call when the dealer name is empty", async () => {
    const search = clientReturning(cand({}));
    const r = await resolveWebsite({ name: "  ", city: "Dallas", state: "TX" }, { search, apiKey: "k" });
    expect(r).toEqual({ website: null, confidence: "LOW" });
    expect(search).not.toHaveBeenCalled();
  });

  it("throws when no API key is configured rather than silently returning no website", async () => {
    const saved = process.env.GOOGLE_PLACES_API_KEY;
    delete process.env.GOOGLE_PLACES_API_KEY;
    try {
      await expect(resolveWebsite(dealer, { search: clientReturning() })).rejects.toThrow(/GOOGLE_PLACES_API_KEY/);
    } finally {
      if (saved !== undefined) process.env.GOOGLE_PLACES_API_KEY = saved;
    }
  });

  it("propagates Places API failures instead of reporting them as no hits", async () => {
    const search = vi.fn(async () => { throw new Error("Places API 429: quota"); });
    await expect(resolveWebsite(dealer, { search, apiKey: "k" })).rejects.toThrow(/429/);
  });
});

describe("namesMatch", () => {
  it("ignores case, punctuation, apostrophes, ampersands and legal suffixes", () => {
    expect(namesMatch("JOE'S TIRE & WHEEL, LLC", "Joes Tire and Wheel")).toBe(true);
    expect(namesMatch("Acme   Wheels  Inc.", "acme wheels")).toBe(true);
  });

  it("ignores accents and curly apostrophes without eating letters or digits", () => {
    expect(namesMatch("Café Wheels 4U", "Cafe Wheels 4U")).toBe(true);
    expect(namesMatch("Joe’s Tire", "Joes Tire")).toBe(true);
    expect(namesMatch("Route 66 Wheels", "Route 67 Wheels")).toBe(false);
  });

  it("matches when one name is the other plus extra words", () => {
    expect(namesMatch("Lone Star Wheel", "Lone Star Wheel & Tire Dallas")).toBe(true);
  });

  it("does not match different businesses", () => {
    expect(namesMatch("Lone Star Wheel", "Big Tex Wheel")).toBe(false);
    expect(namesMatch("Rim Pros", "Prime Rims")).toBe(false);
  });

  it("does not let a generic-only name match by containment", () => {
    expect(namesMatch("Auto Repair", "Bob's Auto Repair")).toBe(false);
  });

  it("does not match empty names", () => {
    expect(namesMatch("", "")).toBe(false);
    expect(namesMatch("LLC", "Inc")).toBe(false);
  });
});

describe("citiesMatch", () => {
  it("ignores case and punctuation and expands saint/fort/mount abbreviations", () => {
    expect(citiesMatch("DALLAS", "Dallas")).toBe(true);
    expect(citiesMatch("St. Louis", "Saint Louis")).toBe(true);
    expect(citiesMatch("Ft. Worth", "Fort Worth")).toBe(true);
  });

  it("does not match different cities or missing ones", () => {
    expect(citiesMatch("Dallas", "Houston")).toBe(false);
    expect(citiesMatch("Dallas", null)).toBe(false);
    expect(citiesMatch("", "")).toBe(false);
  });
});
