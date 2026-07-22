import { PublicBrandService } from "@rhino/services";

/**
 * Brand-per-deployment (addendum #1, refined): each Vercel project sets
 * BRAND_KEY (RHINO now; EVERFLOW later as a second project on the same
 * codebase). Config lives in the BrandConfig table so NAP/phone are editable
 * without a deploy. No request-header reads → pages stay static/ISR.
 */
export type Brand = {
  key: string;
  name: string;
  legalName: string;
  phone: string;
  phoneDisplay: string;
  contactEmail: string | null;
  networkName: string;
  locationId: string;
  logoUrl: string | null; // owner-uploaded logo; null → built-in default
  heroImageUrl: string | null; // owner-uploaded homepage banner photo; null → built-in graphic
  address: { streetAddress: string; addressLocality: string; addressRegion: string; postalCode?: string; addressCountry: string };
};

export const BRAND_KEY = process.env.BRAND_KEY ?? "RHINO";

/**
 * One-line NAP string. Rhino's fallback street address is still the city
 * placeholder ("Orlando, FL"), so skip the locality when the street already
 * contains it — avoids "Orlando, FL, Orlando, FL".
 */
export function brandAddressLine(b: Brand): string {
  const { streetAddress, addressLocality, addressRegion, postalCode } = b.address;
  const zip = postalCode ? ` ${postalCode}` : "";
  if (streetAddress.includes(addressLocality)) return `${streetAddress}${zip}`;
  return `${streetAddress}, ${addressLocality}, ${addressRegion}${zip}`;
}

const FALLBACK: Brand = BRAND_KEY === "EVERFLOW" ? {
  key: "EVERFLOW",
  name: "Everflow Tires & Wheels",
  legalName: "EVERFLOW TIRES & WHEELS LLC",
  phone: "+19033376132",
  phoneDisplay: "(903) 337-6132",
  contactEmail: "everflowtire@gmail.com",
  networkName: "EVERFLOW Preferred Dealer Network",
  locationId: "",
  logoUrl: null,
  heroImageUrl: null,
  address: { streetAddress: "5091 Pulaski St", addressLocality: "Dallas", addressRegion: "TX", postalCode: "75247", addressCountry: "US" },
} : {
  key: "RHINO",
  name: "Rhino Tire USA",
  legalName: "RHINO TIRE USA LLC",
  phone: "+14077775598",
  phoneDisplay: "(407) 777-5598",
  contactEmail: "info@rhinotiresusa.com",
  networkName: "RHINO Local Installer Network",
  locationId: "",
  logoUrl: null,
  heroImageUrl: null,
  address: { streetAddress: "Orlando, FL", addressLocality: "Orlando", addressRegion: "FL", addressCountry: "US" },
};

let cached: { brand: Brand; at: number } | null = null;
const TTL = 60_000;

export async function getBrand(): Promise<Brand> {
  if (cached && Date.now() - cached.at < TTL) return cached.brand;
  let brand = FALLBACK;
  try {
    const dto = await PublicBrandService.get(BRAND_KEY);
    if (dto) brand = { ...dto, address: dto.address ?? FALLBACK.address };
  } catch {
    // DB hiccup → fall back to constants; never take the site down over branding
  }
  cached = { brand, at: Date.now() };
  return brand;
}
