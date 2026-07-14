import type { ProductCategory } from "@rhino/database";

/**
 * Public stock is exposed only as coarse buckets — never exact counts
 * (docs/initial-audit.md: snapshot inventory must not leak real-time numbers).
 */
export type StockStatus = "IN_STOCK" | "LIMITED" | "CONTACT_FOR_AVAILABILITY";

export type PublicTireSpecDTO = {
  width: number | null;
  aspectRatio: number | null;
  rimDiameter: number | null;
  construction: string | null;
  plyRating: number | null;
  loadRange: string | null;
  loadIndex: string | null;
  speedRating: string | null;
  position: string | null;
  application: string | null;
  treadDepth32nds: number | null;
  maxLoadLbs: number | null;
  maxPressurePsi: number | null;
  rimWidthRange: string | null;
  overallDiameterIn: number | null;
  sectionWidthIn: number | null;
};

export type PublicWheelSpecDTO = {
  diameterIn: number | null;
  widthIn: number | null;
  boltPattern: string | null;
  lugCount: number | null;
  centerBoreMm: number | null;
  offsetMm: number | null;
  backspacingIn: number | null;
  loadRatingLbs: number | null;
  finish: string | null;
  material: string | null;
};

export type PublicPartSpecDTO = {
  partType: string | null;
  capacity: string | null;
  dimensions: string | null;
  material: string | null;
  mountingType: string | null;
  compatibilityNotes: string | null;
  certGrade: string | null;
};

export type PublicProductImageDTO = {
  url: string;
  alt: string;
  isPrimary: boolean;
  sortOrder: number;
};

/**
 * The ONLY product shape the anonymous website tier may see.
 * Hard rule (docs/architecture.md): cost, priceA–D, and margins must never
 * appear here. Fields are mapped explicitly — never spread a Prisma row.
 */
export type PublicProductDTO = {
  id: string; // opaque cuid — used for installation-capability lookups
  slug: string;
  sku: string;
  name: string;
  brand: string | null;
  brandLogoUrl: string | null; // owner-uploaded brand logo (public brand-assets bucket)
  pattern: string | null;
  category: ProductCategory;
  sizeSpec: string | null;
  description: string;
  msrp: number | null;
  countryOfOrigin: string | null;
  warrantySummary: string | null;
  features: string[];
  stockStatus: StockStatus;
  images: PublicProductImageDTO[];
  tireSpec: PublicTireSpecDTO | null;
  wheelSpec: PublicWheelSpecDTO | null;
  partSpec: PublicPartSpecDTO | null;
};

/** Internal CRM search hit — includes the customer-tier price and per-location stock. */
export type InternalProductHit = {
  id: string;
  sku: string;
  brand: string | null;
  category: string;
  rawCategory: string | null;
  sizeSpec: string | null;
  description: string;
  imagePath: string | null;
  tierPrice: number | null;
  stock: { tag: string; qty: number }[];
};
