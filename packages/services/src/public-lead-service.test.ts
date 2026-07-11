import { beforeEach, describe, expect, it, vi } from "vitest";

const leadCreate = vi.fn();
const userFindMany = vi.fn();
const locationFindFirst = vi.fn();

vi.mock("@rhino/database", () => ({
  db: {
    lead: { create: (...a: unknown[]) => leadCreate(...a) },
    user: { findMany: (...a: unknown[]) => userFindMany(...a) },
    location: { findFirst: (...a: unknown[]) => locationFindFirst(...a) },
  },
}));

import { PublicLeadService, rateLimited } from "./public-lead-service";

beforeEach(() => {
  leadCreate.mockReset().mockResolvedValue({ id: "lead1" });
  userFindMany.mockReset().mockResolvedValue([
    { id: "rep1", role: "SALES_REP", _count: { leads: 2 } },
    { id: "rep2", role: "SALES_REP", _count: { leads: 0 } },
  ]);
  locationFindFirst.mockReset().mockResolvedValue({ id: "loc1" });
});

describe("PublicLeadService.createQuoteRequest", () => {
  it("creates a WEBSITE_QUOTE lead assigned to the least-loaded rep", async () => {
    const r = await PublicLeadService.createQuoteRequest(
      { companyName: "Test Co", contactPerson: "Jane", phone: "4075551234", productsOfInterest: "ST235/80R16 x 48" },
      `t-${Math.random()}`,
    );
    expect(r.ok).toBe(true);
    const data = leadCreate.mock.calls[0][0].data;
    expect(data.source).toBe("WEBSITE_QUOTE");
    expect(data.assignedRepId).toBe("rep2"); // fewest open leads
    expect(data.locationId).toBe("loc1");
  });

  it("rejects invalid input without touching the DB", async () => {
    const r = await PublicLeadService.createQuoteRequest({ companyName: "X" }, `t-${Math.random()}`);
    expect(r.ok).toBe(false);
    expect(leadCreate).not.toHaveBeenCalled();
  });
});

describe("PublicLeadService.createDealerApplication", () => {
  it("creates a WEBSITE_DEALER_APP lead with form payload in meta", async () => {
    const r = await PublicLeadService.createDealerApplication(
      { companyName: "Fleet LLC", contactPerson: "Bob", phone: "2145559876", email: "b@f.com", businessType: "Fleet", deliveryZip: "75201" },
      `t-${Math.random()}`,
    );
    expect(r.ok).toBe(true);
    const data = leadCreate.mock.calls[0][0].data;
    expect(data.source).toBe("WEBSITE_DEALER_APP");
    expect(data.meta).toMatchObject({ businessType: "Fleet", deliveryZip: "75201" });
  });
});

describe("rate limiting", () => {
  it("blocks after 5 hits in the window from the same key", () => {
    const key = `t-${Math.random()}`;
    for (let i = 0; i < 5; i++) expect(rateLimited(key)).toBe(false);
    expect(rateLimited(key)).toBe(true);
  });
});
