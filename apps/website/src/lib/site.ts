/**
 * Canonical entity identity (docs/seo-requirements.md): legalName
 * "RHINO TIRE USA LLC", brand "Rhino Tire USA" — one spelling everywhere.
 * The new platform launches on rhinotiresusa.com.
 */
export const SITE = {
  name: "Rhino Tire USA",
  legalName: "RHINO TIRE USA LLC",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.rhinotiresusa.com",
  phone: process.env.NEXT_PUBLIC_PHONE ?? "+1-407-000-0000", // TODO: real number before launch (NAP audit)
  phoneDisplay: process.env.NEXT_PUBLIC_PHONE_DISPLAY ?? "(407) 000-0000",
  address: {
    streetAddress: process.env.NEXT_PUBLIC_ADDR_STREET ?? "Orlando, FL", // TODO: real NAP before launch
    addressLocality: "Orlando",
    addressRegion: "FL",
    postalCode: process.env.NEXT_PUBLIC_ADDR_ZIP ?? "",
    addressCountry: "US",
  },
  description:
    "Wholesale distributor of trailer, passenger, light-truck and commercial-truck tires, wheels and trailer parts. Warehouses in Orlando, FL and Dallas, TX. Dealer pricing for tire shops, trailer manufacturers and fleets.",
} as const;

export const CATEGORY_SLUGS: Record<string, { db: string; label: string; parent: "tires" | "wheels" | "parts" }> = {
  "st-trailer": { db: "TRAILER_TIRES", label: "ST Trailer Tires", parent: "tires" },
  passenger: { db: "PCR_TIRES", label: "Passenger Tires", parent: "tires" },
  "light-truck": { db: "LT_TIRES", label: "Light Truck Tires", parent: "tires" },
  "commercial-truck": { db: "TBR_TIRES", label: "Commercial Truck Tires", parent: "tires" },
};

/** "ST235/80R16" → "st235-80r16" (URL slug) */
export const sizeToSlug = (size: string) => size.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
/** loose compare: strips everything non-alphanumeric */
export const sizeKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export const STOCK_LABEL: Record<string, string> = {
  IN_STOCK: "In Stock",
  LIMITED: "Limited Stock",
  CONTACT_FOR_AVAILABILITY: "Contact for Availability",
};
