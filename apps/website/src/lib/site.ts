/**
 * Canonical entity identity (docs/seo-requirements.md): legalName
 * "RHINO TIRE USA LLC", brand "Rhino Tire USA" — one spelling everywhere.
 * The new platform launches on rhinotiresusa.com.
 */
export const SITE = {
  name: "Rhino Tire USA",
  legalName: "RHINO TIRE USA LLC",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.rhinotiresusa.com",
  phone: process.env.NEXT_PUBLIC_PHONE ?? "+14077775598", // owner-confirmed wholesale line
  phoneDisplay: process.env.NEXT_PUBLIC_PHONE_DISPLAY ?? "(407) 777-5598",
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

/** TireSpec.application values that count as "specialty" (ATV, golf, ag…). */
export const SPECIALTY_APPLICATIONS = ["atv-utv", "golf-cart", "lawn-garden", "industrial", "agricultural"];

/**
 * Owner-approved main navigation (2026-07-13). Keep it merchandising-led;
 * technical filters belong on category and search-result pages, not here.
 */
export const MAIN_NAV: { href: string; label: string; mega?: boolean }[] = [
  { href: "/tires", label: "Tires", mega: true },
  { href: "/wheels", label: "Wheels" },
  { href: "/packages", label: "Tire & Wheel Packages" },
  { href: "/parts", label: "Trailer Parts" },
  { href: "/brands", label: "Brands" },
  { href: "/deals", label: "Deals" },
  { href: "/tools", label: "Tools" },
  { href: "/knowledge", label: "Knowledge Center" },
  { href: "/dealer/login", label: "Dealer Login" },
];

/** The Tires mega menu, grouped into columns. */
export const TIRES_MEGA: { title: string; items: { href: string; label: string; blurb?: string }[] }[] = [
  {
    title: "Find Your Tires",
    items: [
      { href: "/tires/by-size", label: "Search by Tire Size", blurb: "Any format — 2256517 works too" },
      { href: "/tires/by-vehicle", label: "Search by Vehicle", blurb: "Find the size your vehicle takes" },
    ],
  },
  {
    title: "Shop by Category",
    items: [
      { href: "/tires/passenger", label: "Passenger & CUV Tires" },
      { href: "/tires/light-truck", label: "Light Truck & SUV Tires" },
      { href: "/tires/commercial-truck", label: "Commercial Truck Tires" },
      { href: "/tires/st-trailer", label: "Trailer Tires" },
      { href: "/tires/specialty", label: "Specialty Tires" },
    ],
  },
  {
    title: "More",
    items: [
      { href: "/brands", label: "Shop All Brands" },
      { href: "/dealer/quick-order", label: "Dealer Quick Order", blurb: "Paste your list, get a quote" },
    ],
  },
];

/** "ST235/80R16" → "st235-80r16" (URL slug) */
export const sizeToSlug = (size: string) => size.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
/** loose compare: strips everything non-alphanumeric */
export const sizeKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export const STOCK_LABEL: Record<string, string> = {
  IN_STOCK: "In Stock",
  LIMITED: "Limited Stock",
  CONTACT_FOR_AVAILABILITY: "Contact for Availability",
};
