import { beforeEach, describe, expect, it, vi } from "vitest";

const brandFindUnique = vi.fn();
const installerFindMany = vi.fn();
const productFindUnique = vi.fn();

vi.mock("@rhino/database", () => ({
  db: {
    brandConfig: { findUnique: (...a: unknown[]) => brandFindUnique(...a) },
    installer: { findMany: (...a: unknown[]) => installerFindMany(...a) },
    product: { findUnique: (...a: unknown[]) => productFindUnique(...a) },
  },
}));

import { PublicInstallerService } from "./public-installer-service";

// IDEAL at 32837 (Orlando). 32836 ≈ 7 mi away; 33801 (Lakeland) ≈ 40 mi away.
const ideal = {
  id: "ideal1", storeName: "IDEAL TIRES & WHEELS", address: "11423 Satellite Blvd",
  city: "Orlando", state: "FL", zip: "32837", phone: "+13216820973",
  hoursJson: { mon: "8:00-17:30" }, appointmentEnabled: true, sameDayEnabled: false,
  preferredStatus: "OWNED", serviceRadiusMi: 35,
  // fields that must NEVER reach the public DTO:
  notifyEmail: "info@rhinotiresusa.com", email: "secret@x.com", assignedRepId: "rep1",
  responseScore: 5, customerId: "cust1",
};

beforeEach(() => {
  brandFindUnique.mockReset().mockResolvedValue({ locationId: "loc1", active: true });
  installerFindMany.mockReset().mockResolvedValue([ideal]);
  productFindUnique.mockReset();
});

describe("PublicInstallerService.findOptions", () => {
  it("returns IDEAL first inside the 35mi service radius", async () => {
    const r = await PublicInstallerService.findOptions({ zip: "32836", brandKey: "RHINO" });
    expect(r.kind).toBe("IDEAL");
    if (r.kind === "IDEAL") {
      expect(r.installer.storeName).toBe("IDEAL TIRES & WHEELS");
      expect(r.installer.distanceMi).toBeLessThanOrEqual(35);
      expect(r.installer.phoneDisplay).toBe("(321) 682-0973");
    }
  });

  it("returns NONE outside the service radius (Lakeland, ~40mi)", async () => {
    const r = await PublicInstallerService.findOptions({ zip: "33801", brandKey: "RHINO" });
    expect(r.kind).toBe("NONE");
  });

  it("rejects invalid ZIPs", async () => {
    expect((await PublicInstallerService.findOptions({ zip: "abc", brandKey: "RHINO" })).kind).toBe("INVALID_ZIP");
    expect((await PublicInstallerService.findOptions({ zip: "00000", brandKey: "RHINO" })).kind).toBe("INVALID_ZIP");
  });

  it("returns NONE for inactive brands", async () => {
    brandFindUnique.mockResolvedValue({ locationId: "loc2", active: false });
    expect((await PublicInstallerService.findOptions({ zip: "32836", brandKey: "EVERFLOW" })).kind).toBe("NONE");
  });

  it("filters by product category capability", async () => {
    productFindUnique.mockResolvedValue({ category: "TBR_TIRES" });
    await PublicInstallerService.findOptions({ zip: "32836", brandKey: "RHINO", productId: "p1" });
    const where = installerFindMany.mock.calls[0][0].where;
    expect(where.tbr).toBe(true); // IDEAL has tbr:false → excluded at the DB level
  });

  it("public DTO never contains contact/internal fields", async () => {
    const r = await PublicInstallerService.findOptions({ zip: "32836", brandKey: "RHINO" });
    expect(r.kind).toBe("IDEAL");
    const json = JSON.stringify(r);
    for (const bad of ["notifyEmail", "assignedRepId", "responseScore", "customerId", "secret@x.com", "serviceRadiusMi"]) {
      expect(json).not.toContain(bad);
    }
  });

  it("caps partner results at 3, preferred ranked above nearer non-preferred", async () => {
    const partner = (id: string, zip: string, preferredStatus: string) => ({ ...ideal, id, storeName: id, zip, preferredStatus, serviceRadiusMi: 50 });
    installerFindMany.mockResolvedValue([
      partner("near", "32837", "PARTNER"),
      partner("pref", "32809", "PREFERRED"),
      partner("p3", "32819", "PARTNER"),
      partner("p4", "32821", "PARTNER"),
    ]);
    const r = await PublicInstallerService.findOptions({ zip: "32836", brandKey: "RHINO" });
    expect(r.kind).toBe("PARTNERS");
    if (r.kind === "PARTNERS") {
      expect(r.installers).toHaveLength(3);
      expect(r.installers[0].storeName).toBe("pref"); // distance is not the only factor (spec §9)
    }
  });
});
