import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MANDATORY security test (kickoff STEP 5): public DTOs must never contain
 * dealer pricing. If someone "optimizes" the DTO mapping into a spread of the
 * Prisma row, this fails.
 */

const fakeProduct = (over: Partial<Record<string, unknown>> = {}) => ({
  id: "p1",
  sku: "TE-ST23580",
  brand: "Transeagle",
  category: "TRAILER_TIRES",
  rawCategory: "Trailer",
  discontinued: false,
  imagePath: null,
  sizeSpec: "ST235/80R16",
  description: "ST Radial 10-ply",
  // ---- fields that must NEVER leak ----
  cost: 57.0,
  priceA: 67.26,
  priceB: 71.25,
  priceC: 75.24,
  priceD: 79.8,
  // -------------------------------------
  active: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  slug: "transeagle-st235-80r16-10-ply",
  name: "Transeagle ST235/80R16 10-Ply",
  pattern: null,
  visibility: "PUBLIC",
  msrp: 105,
  countryOfOrigin: "China",
  warrantySummary: null,
  featuresJson: ["ST radial 10-ply"],
  inventory: [
    { id: "i1", productId: "p1", locationId: "l1", quantity: 30, snapshotAt: new Date() },
    { id: "i2", productId: "p1", locationId: "l2", quantity: 5, snapshotAt: new Date() },
  ],
  images: [],
  tireSpec: null,
  wheelSpec: null,
  partSpec: null,
  ...over,
});

const findMany = vi.fn();
const findFirst = vi.fn();

vi.mock("@rhino/database", () => ({
  db: {
    product: { findMany: (...a: unknown[]) => findMany(...a), findFirst: (...a: unknown[]) => findFirst(...a) },
    productBrandLogo: { findMany: async () => [] },
  },
}));

import { PublicCatalogService } from "./public-catalog-service";

const FORBIDDEN = ["cost", "priceA", "priceB", "priceC", "priceD", "margin"];

function collectKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => collectKeys(v, keys));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      keys.add(k);
      collectKeys(v, keys);
    }
  }
  return keys;
}

beforeEach(() => {
  findMany.mockReset();
  findFirst.mockReset();
});

describe("PublicCatalogService — pricing must never leak", () => {
  it("listPublished DTOs contain no cost/priceA-D keys at any depth", async () => {
    findMany.mockResolvedValue([fakeProduct()]);
    const dtos = await PublicCatalogService.listPublished();
    expect(dtos).toHaveLength(1);
    const keys = collectKeys(dtos);
    for (const bad of FORBIDDEN) expect(keys.has(bad)).toBe(false);
    // serialized payload (what actually leaves the server) is clean too
    const json = JSON.stringify(dtos);
    for (const bad of FORBIDDEN) expect(json).not.toContain(`"${bad}"`);
  });

  it("getBySlug DTO contains no pricing keys", async () => {
    findFirst.mockResolvedValue(fakeProduct());
    const dto = await PublicCatalogService.getBySlug("transeagle-st235-80r16-10-ply");
    expect(dto).not.toBeNull();
    const keys = collectKeys(dto);
    for (const bad of FORBIDDEN) expect(keys.has(bad)).toBe(false);
  });

  it("only queries PUBLIC, active, non-discontinued products", async () => {
    findMany.mockResolvedValue([]);
    await PublicCatalogService.listPublished();
    const where = findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ visibility: "PUBLIC", active: true, discontinued: false });
  });
});

describe("PublicCatalogService — stock buckets, never exact counts", () => {
  it("exposes coarse buckets only", async () => {
    findMany.mockResolvedValue([
      fakeProduct({ inventory: [{ quantity: 100 }] }),
      fakeProduct({ sku: "B", slug: "b", inventory: [{ quantity: 3 }] }),
      fakeProduct({ sku: "C", slug: "c", inventory: [] }),
    ]);
    const [inStock, limited, none] = await PublicCatalogService.listPublished();
    expect(inStock.stockStatus).toBe("IN_STOCK");
    expect(limited.stockStatus).toBe("LIMITED");
    expect(none.stockStatus).toBe("CONTACT_FOR_AVAILABILITY");
    // the DTO must not carry raw quantities
    const keys = collectKeys([inStock, limited, none]);
    expect(keys.has("quantity")).toBe(false);
    expect(keys.has("inventory")).toBe(false);
  });
});
