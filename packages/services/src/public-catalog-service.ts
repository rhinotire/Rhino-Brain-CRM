import { db, Prisma } from "@rhino/database";
import { sizeNeedles } from "./size-normalize";
import type {
  PublicPartSpecDTO,
  PublicProductDTO,
  PublicTireSpecDTO,
  PublicWheelSpecDTO,
  StockStatus,
} from "./types";

/** Below this many total units a product shows as LIMITED instead of IN_STOCK. */
const LIMITED_THRESHOLD = 20;

const num = (d: Prisma.Decimal | null): number | null => (d === null ? null : Number(d));

const toStockStatus = (totalUnits: number): StockStatus =>
  totalUnits <= 0 ? "CONTACT_FOR_AVAILABILITY" : totalUnits < LIMITED_THRESHOLD ? "LIMITED" : "IN_STOCK";

type PublishedRow = Prisma.ProductGetPayload<{
  include: { inventory: true; images: true; tireSpec: true; wheelSpec: true; partSpec: true };
}>;

/**
 * Explicit field-by-field mapping — NEVER spread the Prisma row. cost and
 * priceA–D must not reach the anonymous tier (docs/architecture.md hard rule).
 */
function toPublicDTO(p: PublishedRow): PublicProductDTO {
  const tire: PublicTireSpecDTO | null = p.tireSpec
    ? {
        width: p.tireSpec.width,
        aspectRatio: p.tireSpec.aspectRatio,
        rimDiameter: num(p.tireSpec.rimDiameter),
        construction: p.tireSpec.construction,
        plyRating: p.tireSpec.plyRating,
        loadRange: p.tireSpec.loadRange,
        loadIndex: p.tireSpec.loadIndex,
        speedRating: p.tireSpec.speedRating,
        position: p.tireSpec.position,
        application: p.tireSpec.application,
        treadDepth32nds: num(p.tireSpec.treadDepth32nds),
        maxLoadLbs: p.tireSpec.maxLoadLbs,
        maxPressurePsi: p.tireSpec.maxPressurePsi,
        rimWidthRange: p.tireSpec.rimWidthRange,
        overallDiameterIn: num(p.tireSpec.overallDiameterIn),
        sectionWidthIn: num(p.tireSpec.sectionWidthIn),
      }
    : null;
  const wheel: PublicWheelSpecDTO | null = p.wheelSpec
    ? {
        diameterIn: num(p.wheelSpec.diameterIn),
        widthIn: num(p.wheelSpec.widthIn),
        boltPattern: p.wheelSpec.boltPattern,
        lugCount: p.wheelSpec.lugCount,
        centerBoreMm: num(p.wheelSpec.centerBoreMm),
        offsetMm: p.wheelSpec.offsetMm,
        backspacingIn: num(p.wheelSpec.backspacingIn),
        loadRatingLbs: p.wheelSpec.loadRatingLbs,
        finish: p.wheelSpec.finish,
        material: p.wheelSpec.material,
      }
    : null;
  const part: PublicPartSpecDTO | null = p.partSpec
    ? {
        partType: p.partSpec.partType,
        capacity: p.partSpec.capacity,
        dimensions: p.partSpec.dimensions,
        material: p.partSpec.material,
        mountingType: p.partSpec.mountingType,
        compatibilityNotes: p.partSpec.compatibilityNotes,
        certGrade: p.partSpec.certGrade,
      }
    : null;

  return {
    id: p.id,
    slug: p.slug ?? p.sku.toLowerCase(),
    sku: p.sku,
    name: p.name ?? p.description,
    brand: p.brand,
    pattern: p.pattern,
    category: p.category,
    sizeSpec: p.sizeSpec,
    description: p.description,
    msrp: num(p.msrp),
    countryOfOrigin: p.countryOfOrigin,
    warrantySummary: p.warrantySummary,
    features: Array.isArray(p.featuresJson) ? (p.featuresJson as unknown[]).map(String) : [],
    stockStatus: toStockStatus(p.inventory.reduce((sum, i) => sum + i.quantity, 0)),
    images: p.images
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((i) => ({ url: i.url, alt: i.alt, isPrimary: i.isPrimary, sortOrder: i.sortOrder })),
    tireSpec: tire,
    wheelSpec: wheel,
    partSpec: part,
  };
}

const PUBLISHED_WHERE: Prisma.ProductWhereInput = {
  visibility: "PUBLIC",
  active: true,
  discontinued: false,
};

const PUBLISHED_INCLUDE = {
  inventory: true,
  images: true,
  tireSpec: true,
  wheelSpec: true,
  partSpec: true,
} as const;

/**
 * The ONLY service the anonymous website tier may call for products.
 * Whitelist reads: published products, coarse stock buckets. No pricing.
 */
export const PublicCatalogService = {
  async listPublished(params: { category?: string; query?: string; take?: number; skip?: number } = {}): Promise<PublicProductDTO[]> {
    const q = params.query?.trim();
    // Normalized size search first (spec §1A): "2256517", "225 65 17",
    // "11R225" etc. all resolve to the same canonical needles.
    const needles = q ? sizeNeedles(q) : [];
    const rows = await db.product.findMany({
      where: {
        ...PUBLISHED_WHERE,
        ...(params.category ? { category: params.category as PublishedRow["category"] } : {}),
        ...(needles.length
          ? { OR: needles.map((n) => ({ sizeSpec: { contains: n, mode: "insensitive" as const } })) }
          : q && q.length >= 2
            ? {
                OR: [
                  { sizeSpec: { contains: q, mode: "insensitive" } },
                  { sku: { contains: q, mode: "insensitive" } },
                  { brand: { contains: q, mode: "insensitive" } },
                  { name: { contains: q, mode: "insensitive" } },
                  { description: { contains: q, mode: "insensitive" } },
                ],
              }
            : {}),
      },
      include: PUBLISHED_INCLUDE,
      orderBy: [{ sizeSpec: "asc" }, { sku: "asc" }],
      take: Math.min(params.take ?? 60, 200),
      skip: params.skip ?? 0,
    });
    return rows.map(toPublicDTO);
  },

  async getBySlug(slug: string): Promise<PublicProductDTO | null> {
    if (!slug) return null;
    const row = await db.product.findFirst({
      where: { ...PUBLISHED_WHERE, slug },
      include: PUBLISHED_INCLUDE,
    });
    return row ? toPublicDTO(row) : null;
  },
};
