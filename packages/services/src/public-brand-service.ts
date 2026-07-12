import { db } from "@rhino/database";

/** Web-safe brand identity (no internal ids beyond locationId, no credentials). */
export type PublicBrandDTO = {
  key: string;
  name: string;
  legalName: string;
  phone: string;
  phoneDisplay: string;
  contactEmail: string | null;
  networkName: string;
  locationId: string;
  logoUrl: string | null; // owner-uploaded logo (public brand-assets bucket)
  heroImageUrl: string | null; // owner-uploaded homepage banner photo
  address: { streetAddress: string; addressLocality: string; addressRegion: string; postalCode?: string; addressCountry: string } | null;
};

export const PublicBrandService = {
  async get(key: string): Promise<PublicBrandDTO | null> {
    const row = await db.brandConfig.findFirst({ where: { key, active: true } });
    if (!row) return null;
    const supabase = process.env.SUPABASE_URL?.replace(/\/$/, "");
    return {
      key: row.key,
      name: row.name,
      legalName: row.legalName,
      phone: row.phone,
      phoneDisplay: row.phoneDisplay,
      contactEmail: row.contactEmail,
      networkName: row.networkName,
      locationId: row.locationId,
      logoUrl: row.logoPath && supabase ? `${supabase}/storage/v1/object/public/brand-assets/${row.logoPath}` : null,
      heroImageUrl: row.heroImagePath && supabase ? `${supabase}/storage/v1/object/public/brand-assets/${row.heroImagePath}` : null,
      address: (row.addressJson as PublicBrandDTO["address"]) ?? null,
    };
  },
};
