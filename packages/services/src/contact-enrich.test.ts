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

  it("matches by Apollo person id, un-obfuscates the name, reveals email (real plan behavior 2026-07-25)", async () => {
    const fetchFn = fakeFetchRouter({
      "mixed_people/api_search": () => ({
        people: [
          { id: "p1", first_name: "Jane", last_name_obfuscated: "Sm***h", title: "Marketing Director" },
          { id: "p2", first_name: "Roger", last_name_obfuscated: "Lu***s", title: "Purchasing Manager" },
        ],
      }),
      "people/match": (init) => {
        const body = JSON.parse(String(init?.body));
        return body.id === "p2"
          ? { person: { name: "Roger Lucas", title: "Purchasing Manager", linkedin_url: "li/roger", email: "roger@x.com", email_status: "verified" } }
          : { person: { email: "email_not_unlocked@x.com" } };
      },
    });
    const r = await findDecisionMakers({ companyName: "X Tire", domain: "x.com" }, { apolloKey: "k" }, fetchFn);
    expect(r.contacts[0]).toMatchObject({ name: "Roger Lucas", title: "Purchasing Manager", email: "roger@x.com", emailStatus: "verified", linkedinUrl: "li/roger", source: "APOLLO" });
    // obfuscated placeholder email must not count as revealed
    expect(r.contacts.find((c) => c.name.startsWith("Jane"))?.email).toBeNull();
    expect(r.apolloCredits).toBe(1);
  });

  it("falls back to RocketReach when Apollo has no email", async () => {
    const fetchFn = fakeFetchRouter({
      "mixed_people/api_search": () => ({ people: [{ id: "p9", name: "Ann Lee", title: "Owner" }] }),
      "people/match": () => ({ person: { name: "Ann Lee", email: null } }),
      "rocketreach.co": () => ({ emails: [{ email: "ann@y.com", smtp_valid: "valid" }], phones: [{ number: "555" }] }),
    });
    const r = await findDecisionMakers({ companyName: "Y Tire", domain: null }, { apolloKey: "k", rocketReachKey: "rr" }, fetchFn);
    expect(r.contacts[0]).toMatchObject({ name: "Ann Lee", email: "ann@y.com", source: "ROCKETREACH", phone: "555" });
    expect(r.rocketReachLookups).toBe(1);
    expect(r.apolloCredits).toBe(0);
  });
});
