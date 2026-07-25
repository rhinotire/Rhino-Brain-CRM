import { describe, expect, it } from "vitest";
import { findDecisionMakers } from "./contact-enrich";

function fakeFetchRouter(routes: Record<string, (init?: RequestInit) => unknown>): typeof fetch {
  return (async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url);
    for (const [needle, handler] of Object.entries(routes)) {
      if (u.includes(needle)) return new Response(JSON.stringify(handler(init)), { status: 200 });
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
}

describe("findDecisionMakers", () => {
  it("throws without an Apollo key", async () => {
    await expect(findDecisionMakers({ companyName: "X", domain: "x.com" }, {})).rejects.toThrow(/APOLLO_API_KEY/);
  });

  it("searches Apollo, prioritizes buying roles, reveals email via match", async () => {
    const fetchFn = fakeFetchRouter({
      "mixed_people/api_search": () => ({
        people: [
          { name: "Jane Smith", title: "Marketing Director", linkedin_url: "li/jane" },
          { name: "Bob Jones", title: "Purchasing Manager", linkedin_url: "li/bob" },
        ],
      }),
      "people/match": (init) => {
        const body = JSON.parse(String(init?.body));
        return body.name === "Bob Jones"
          ? { person: { email: "bob@x.com", email_status: "verified", sanitized_phone: "+12145550100" } }
          : { person: { email: null } };
      },
    });
    const r = await findDecisionMakers({ companyName: "X Tire", domain: "x.com" }, { apolloKey: "k" }, fetchFn);
    expect(r.contacts[0]).toMatchObject({ name: "Bob Jones", title: "Purchasing Manager", email: "bob@x.com", emailStatus: "verified", source: "APOLLO" });
    expect(r.apolloCredits).toBe(1);
  });

  it("falls back to RocketReach when Apollo has no email", async () => {
    const fetchFn = fakeFetchRouter({
      "mixed_people/api_search": () => ({ people: [{ name: "Ann Lee", title: "Owner" }] }),
      "people/match": () => ({ person: { email: null } }),
      "rocketreach.co": () => ({ emails: [{ email: "ann@y.com", smtp_valid: "valid" }], phones: [{ number: "555" }] }),
    });
    const r = await findDecisionMakers({ companyName: "Y Tire", domain: null }, { apolloKey: "k", rocketReachKey: "rr" }, fetchFn);
    expect(r.contacts[0]).toMatchObject({ name: "Ann Lee", email: "ann@y.com", source: "ROCKETREACH", phone: "555" });
    expect(r.rocketReachLookups).toBe(1);
    expect(r.apolloCredits).toBe(0);
  });
});
