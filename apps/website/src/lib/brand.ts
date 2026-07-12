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

const FALLBACK: Brand = {
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
