import { describe, expect, it, vi } from "vitest";
import { resolveWebsite, namesMatch, nameMatchStrength, nameTokens, citiesMatch } from "./website-resolve";
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

  it("returns null, not another business's URL, when only the city matches", async () => {
    const search = clientReturning(cand({ companyName: "Totally Different Motors", website: "https://other.example/" }));
    const r = await resolveWebsite(dealer, { search, apiKey: "k" });
    expect(r).toEqual({ website: null, confidence: "LOW" });
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

  it("strips double quotes from the name so they cannot break the quoted phrase (M-9)", async () => {
    // An embedded quote would close the phrase early and silently turn it into a loose search, after the call is paid for.
    const search = clientReturning();
    await resolveWebsite({ name: 'Joe "The Wheel Guy" Tires', city: "Dallas", state: "TX" }, { search, apiKey: "k" });
    expect(search.mock.calls[0]![0].query).toBe('"Joe The Wheel Guy Tires" Dallas TX');
  });

  it("collapses the gap a stripped quote leaves, and keeps the phrase balanced for a name that is only quote-wrapped", async () => {
    const search = clientReturning();
    await resolveWebsite({ name: '"Lone Star Wheel & Tire"', city: "Dallas", state: "TX" }, { search, apiKey: "k" });
    await resolveWebsite({ name: 'Rim 20" Wheel & Tire', city: "Dallas", state: "TX" }, { search, apiKey: "k" });
    expect(search.mock.calls[0]![0].query).toBe('"Lone Star Wheel & Tire" Dallas TX');
    expect(search.mock.calls[1]![0].query).toBe('"Rim 20 Wheel & Tire" Dallas TX');
    // An emptied quote pair leaves a double space behind; it must not reach the query.
    await resolveWebsite({ name: 'Lone Star "" Wheel & Tire', city: "Dallas", state: "TX" }, { search, apiKey: "k" });
    expect(search.mock.calls[2]![0].query).toBe('"Lone Star Wheel & Tire" Dallas TX');
  });

  it("is not HIGH when the state contradicts, even if name and city match", async () => {
    const search = clientReturning(cand({ state: "OK" }));
    const r = await resolveWebsite(dealer, { search, apiKey: "k" });
    expect(r).toEqual({ website: "https://lonestarwheel.com/", confidence: "LOW" });
  });

  it("is not HIGH when the dealer's state is blank, even if name and city match", async () => {
    const search = clientReturning(cand({}));
    const r = await resolveWebsite({ ...dealer, state: "  " }, { search, apiKey: "k" });
    expect(r).toEqual({ website: "https://lonestarwheel.com/", confidence: "LOW" });
  });

  it("is not HIGH when Places returns no state for the match", async () => {
    const search = clientReturning(cand({ state: null }));
    const r = await resolveWebsite(dealer, { search, apiKey: "k" });
    expect(r.confidence).toBe("LOW");
  });

  it("stays HIGH when both states are present and equal ignoring case and padding", async () => {
    const search = clientReturning(cand({ state: "tx" }));
    const r = await resolveWebsite({ ...dealer, state: " TX " }, { search, apiKey: "k" });
    expect(r.confidence).toBe("HIGH");
  });

  it.each([
    "https://www.facebook.com/lonestarwheel",
    "https://m.facebook.com/lonestarwheel",
    "https://fb.com/lonestarwheel",
    "https://fb.me/lonestarwheel",
    "https://g.page/lonestarwheel",
    "https://goo.gl/maps/abc",
    "https://www.youtube.com/@lonestarwheel",
    "https://nextdoor.com/pages/lonestarwheel",
    "https://www.yelp.com/biz/lone-star-wheel",
    "https://www.instagram.com/lonestarwheel",
  ])("returns null rather than a social or directory page: %s", async (url) => {
    const search = clientReturning(cand({ website: url }));
    const r = await resolveWebsite(dealer, { search, apiKey: "k" });
    expect(r).toEqual({ website: null, confidence: "LOW" });
  });

  it("does not treat a lookalike host as a directory", async () => {
    const search = clientReturning(cand({ website: "https://notfacebook.com/" }));
    const r = await resolveWebsite(dealer, { search, apiKey: "k" });
    expect(r).toEqual({ website: "https://notfacebook.com/", confidence: "HIGH" });
  });

  it("is only LOW when the match rests on a single distinctive word", async () => {
    const search = clientReturning(cand({ companyName: "Apex Towing", website: "https://apextowing.example/" }));
    const r = await resolveWebsite({ name: "Apex", city: "Dallas", state: "TX" }, { search, apiKey: "k" });
    expect(r).toEqual({ website: "https://apextowing.example/", confidence: "LOW" });
  });

  it("is HIGH when the containment shares two distinctive words", async () => {
    const search = clientReturning(cand({ companyName: "Lone Star Wheel & Tire Dallas" }));
    const r = await resolveWebsite({ ...dealer, name: "Lone Star Wheel" }, { search, apiKey: "k" });
    expect(r.confidence).toBe("HIGH");
  });

  it("never matches a generic-only dealer name, even to an identically named business", async () => {
    const search = clientReturning(cand({ companyName: "Tire Shop", website: "https://tireshop.example/" }));
    const r = await resolveWebsite({ name: "Tire Shop", city: "Dallas", state: "TX" }, { search, apiKey: "k" });
    expect(r).toEqual({ website: null, confidence: "LOW" });
  });

  it("makes no API call for a generic-only dealer name", async () => {
    const search = clientReturning(cand({}));
    await resolveWebsite({ name: "Auto Repair", city: "Dallas", state: "TX" }, { search, apiKey: "k" });
    expect(search).not.toHaveBeenCalled();
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

  it("normalises accents and apostrophes at token level (fails if either replace is removed)", () => {
    // Token arrays, not joined strings: joined, "joe s tire" would equal "joes tire" anyway.
    expect(nameTokens("Peña Tire")).toEqual(["pena", "tire"]);
    expect(nameTokens("Joe’s Tire")).toEqual(["joes", "tire"]);
    expect(nameTokens("Joe's Tire")).toEqual(["joes", "tire"]);
    expect(nameTokens("Café Wheels 4U")).toEqual(["cafe", "wheels", "4u"]);
    // And through the matcher, where a split token breaks a containment match.
    expect(namesMatch("Peña Tire", "Pena Tire Express Dallas")).toBe(true);
    expect(namesMatch("Joe’s Tire", "Joes Tire Express")).toBe(true);
  });

  it("does not eat digits", () => {
    expect(namesMatch("Route 66 Wheels", "Route 67 Wheels")).toBe(false);
  });

  it("grades containment by how many distinctive words are shared", () => {
    expect(nameMatchStrength("Lone Star Wheel", "Lone Star Wheel & Tire")).toBe("STRONG");
    expect(nameMatchStrength("Apex", "Apex Towing")).toBe("WEAK");
    expect(nameMatchStrength("Apex Tire", "Apex Tire Towing")).toBe("WEAK");
    expect(nameMatchStrength("Apex Tire", "Apex Tire")).toBe("STRONG");
  });

  it("matches when one name is the other plus extra words", () => {
    expect(namesMatch("Lone Star Wheel", "Lone Star Wheel & Tire Dallas")).toBe(true);
  });

  it("does not match different businesses", () => {
    expect(namesMatch("Lone Star Wheel", "Big Tex Wheel")).toBe(false);
    expect(namesMatch("Rim Pros", "Prime Rims")).toBe(false);
  });

  it("does not let a generic-only name match, by containment or by identity", () => {
    expect(namesMatch("Auto Repair", "Bob's Auto Repair")).toBe(false);
    expect(namesMatch("Auto Repair", "Auto Repair")).toBe(false);
    expect(namesMatch("Tire Shop", "tire shop")).toBe(false);
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
