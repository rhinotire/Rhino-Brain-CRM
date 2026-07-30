import { COPY } from "@/lib/brand-copy";

/**
 * Canonical entity identity (docs/seo-requirements.md): one spelling everywhere,
 * selected per deployment by brand key (RHINO on rhinotiresusa.com, EVERFLOW on
 * everflowtireusa.com). All brand-conditional strings live in lib/brand-copy.ts.
 */
export const SITE = {
  name: COPY.name,
  legalName: COPY.legalName,
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
  description: COPY.siteDescription,
} as const;

export const CATEGORY_SLUGS: Record<string, { db: string; label: string; parent: "tires" | "wheels" | "parts" }> = {
  "st-trailer": { db: "TRAILER_TIRES", label: "ST Trailer Tires", parent: "tires" },
  passenger: { db: "PCR_TIRES", label: "Passenger Tires", parent: "tires" },
  "light-truck": { db: "LT_TIRES", label: "Light Truck Tires", parent: "tires" },
  "commercial-truck": { db: "TBR_TIRES", label: "Commercial Truck Tires", parent: "tires" },
};

/** TireSpec.application values that count as "specialty" (ATV, golf, ag…). */
export const SPECIALTY_APPLICATIONS = ["atv-utv", "golf-cart", "lawn-garden", "industrial", "agricultural"];

/** The sizes dealers ask for most, per category — shown before the size browser. */
export const POPULAR_BY_CATEGORY: Record<string, string[]> = {
  "st-trailer": ["ST205/75R15", "ST225/75R15", "ST235/80R16"],
  passenger: ["205/55R16", "225/65R17", "225/45R17"],
  "light-truck": ["LT265/70R17", "LT285/75R16"],
  "commercial-truck": ["11R22.5", "295/75R22.5"],
};

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
  { href: "/supplies", label: "Oil & Supplies" },
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
