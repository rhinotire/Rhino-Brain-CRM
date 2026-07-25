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
    let capturedUrl: RequestInfo | URL | undefined;
    const fakeFetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = url;
      captured = init;
      return new Response(JSON.stringify(page), { status: 200 });
    }) as typeof fetch;

    const r = await searchPlacesPage({ query: "commercial tire dealer in Texas", apiKey: "k", fetchFn: fakeFetch });
    expect(r.candidates).toHaveLength(1);
    expect(r.candidates[0]).toMatchObject({ companyName: "Lone Star Commercial Tire", state: "TX", city: "Dallas" });
    expect(r.nextPageToken).toBe("tok123");
    expect((captured?.headers as Record<string, string>)["X-Goog-FieldMask"]).toContain("places.websiteUri");
    expect(String(capturedUrl)).toBe("https://places.googleapis.com/v1/places:searchText");
    expect(captured?.method).toBe("POST");
    expect((captured?.headers as Record<string, string>)["X-Goog-Api-Key"]).toBe("k");
    expect((captured?.headers as Record<string, string>)["X-Goog-FieldMask"]).toContain("nextPageToken");
    const body = JSON.parse(captured?.body as string);
    expect(body).toEqual({ textQuery: "commercial tire dealer in Texas", pageSize: 20 }); // no pageToken key when absent
  });

  it("passes pageToken in the body when provided", async () => {
    let body: Record<string, unknown> = {};
    const fakeFetch = (async (_u: RequestInfo | URL, init?: RequestInit) => {
      body = JSON.parse(init?.body as string);
      return new Response(JSON.stringify({ places: [] }), { status: 200 });
    }) as typeof fetch;
    await searchPlacesPage({ query: "q", apiKey: "k", pageToken: "tok123", fetchFn: fakeFetch });
    expect(body.pageToken).toBe("tok123");
  });

  it("drops nameless places and tolerates missing addressComponents", async () => {
    const payload = { places: [{ nationalPhoneNumber: "555" }, { displayName: { text: "OK Tire" } }] };
    const fakeFetch = (async () => new Response(JSON.stringify(payload), { status: 200 })) as typeof fetch;
    const r = await searchPlacesPage({ query: "q", apiKey: "k", fetchFn: fakeFetch });
    expect(r.candidates).toHaveLength(1);
    expect(r.candidates[0]).toMatchObject({ companyName: "OK Tire", city: null, state: null });
    expect(r.nextPageToken).toBeNull();
  });

  it("throws a readable error on non-200", async () => {
    const fakeFetch = (async () => new Response("quota", { status: 429 })) as typeof fetch;
    await expect(searchPlacesPage({ query: "q", apiKey: "k", fetchFn: fakeFetch })).rejects.toThrow(/429/);
  });
});
