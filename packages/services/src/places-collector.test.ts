import { describe, expect, it } from "vitest";
import { searchPlacesPage } from "./places-collector";

const page = {
  places: [
    {
      displayName: { text: "Lone Star Commercial Tire" },
      nationalPhoneNumber: "(214) 555-0100",
      websiteUri: "https://lonestarcommercialtire.com/",
      formattedAddress: "1200 Industrial Blvd, Dallas, TX 75207, USA",
      rating: 4.6,
      userRatingCount: 87,
      addressComponents: [
        { shortText: "Dallas", types: ["locality"] },
        { shortText: "TX", types: ["administrative_area_level_1"] },
      ],
    },
  ],
  nextPageToken: "tok123",
};

describe("searchPlacesPage", () => {
  it("maps API places to candidates and passes the field mask", async () => {
    let captured: RequestInit | undefined;
    const fakeFetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      captured = init;
      return new Response(JSON.stringify(page), { status: 200 });
    }) as typeof fetch;

    const r = await searchPlacesPage({ query: "commercial tire dealer in Texas", apiKey: "k", fetchFn: fakeFetch });
    expect(r.candidates).toHaveLength(1);
    expect(r.candidates[0]).toMatchObject({ companyName: "Lone Star Commercial Tire", state: "TX", city: "Dallas" });
    expect(r.nextPageToken).toBe("tok123");
    expect((captured?.headers as Record<string, string>)["X-Goog-FieldMask"]).toContain("places.websiteUri");
  });
  it("throws a readable error on non-200", async () => {
    const fakeFetch = (async () => new Response("quota", { status: 429 })) as typeof fetch;
    await expect(searchPlacesPage({ query: "q", apiKey: "k", fetchFn: fakeFetch })).rejects.toThrow(/429/);
  });
});
