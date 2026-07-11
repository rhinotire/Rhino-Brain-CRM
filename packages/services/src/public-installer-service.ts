import { db, ProductCategory } from "@rhino/database";
import { isValidUsZip, zipDistanceMiles } from "./geo";

/**
 * The ONLY installer shape the anonymous tier may see. No email/notifyEmail,
 * no assignedRep, no responseScore, no customer link — contact goes through
 * the platform, not around it.
 */
export type PublicInstallerDTO = {
  id: string;
  storeName: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  phoneDisplay: string;
  hours: Record<string, string> | null;
  distanceMi: number;
  appointmentEnabled: boolean;
  sameDay: boolean;
  preferred: boolean; // OWNED/PREFERRED badge
};

export type InstallationOptions =
  | { kind: "IDEAL"; installer: PublicInstallerDTO }
  | { kind: "PARTNERS"; installers: PublicInstallerDTO[] }
  | { kind: "NONE" }
  | { kind: "INVALID_ZIP" };

const fmtPhone = (p: string) => {
  const d = p.replace(/\D/g, "").replace(/^1/, "");
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : p;
};

function toDTO(i: { id: string; storeName: string; address: string; city: string; state: string; zip: string; phone: string; hoursJson: unknown; appointmentEnabled: boolean; sameDayEnabled: boolean; preferredStatus: string }, distanceMi: number): PublicInstallerDTO {
  return {
    id: i.id,
    storeName: i.storeName,
    address: i.address,
    city: i.city,
    state: i.state,
    zip: i.zip,
    phone: i.phone,
    phoneDisplay: fmtPhone(i.phone),
    hours: (i.hoursJson as Record<string, string>) ?? null,
    distanceMi: Math.round(distanceMi),
    appointmentEnabled: i.appointmentEnabled,
    sameDay: i.sameDayEnabled, // only ever true when operationally verified (spec Hook 2)
    preferred: i.preferredStatus === "OWNED" || i.preferredStatus === "PREFERRED",
  };
}

const categoryCapability: Partial<Record<ProductCategory, "passenger" | "lightTruck" | "trailer" | "tbr" | "wheels">> = {
  PCR_TIRES: "passenger",
  LT_TIRES: "lightTruck",
  TRAILER_TIRES: "trailer",
  TBR_TIRES: "tbr",
  WHEELS: "wheels",
};

/**
 * Routing priority (spec §9): 1) OWNED store (IDEAL) inside its service radius,
 * 2) up to 3 approved partners, 3) NONE → caller shows the manual-fallback form.
 */
export const PublicInstallerService = {
  async findOptions(params: { zip: string; brandKey: string; productId?: string }): Promise<InstallationOptions> {
    const zip = params.zip.trim();
    if (!isValidUsZip(zip)) return { kind: "INVALID_ZIP" };

    const brand = await db.brandConfig.findUnique({ where: { key: params.brandKey }, select: { locationId: true, active: true } });
    if (!brand?.active) return { kind: "NONE" };

    // capability filter from the selected product's category
    let capability: keyof typeof categoryCapability | null = null;
    if (params.productId) {
      const product = await db.product.findUnique({ where: { id: params.productId }, select: { category: true } });
      capability = product?.category ?? null;
    }
    const capField = capability ? categoryCapability[capability] : undefined;

    const installers = await db.installer.findMany({
      where: {
        locationId: brand.locationId,
        active: true,
        ...(capField ? { [capField]: true } : {}),
      },
      select: {
        id: true, storeName: true, address: true, city: true, state: true, zip: true, phone: true,
        hoursJson: true, appointmentEnabled: true, sameDayEnabled: true, preferredStatus: true, serviceRadiusMi: true,
      },
    });

    const inRange = installers
      .map((i) => ({ i, d: zipDistanceMiles(zip, i.zip) }))
      .filter((x): x is { i: (typeof installers)[number]; d: number } => x.d !== null && x.d <= x.i.serviceRadiusMi);

    // Priority 1: the OWNED store (IDEAL)
    const owned = inRange.find((x) => x.i.preferredStatus === "OWNED");
    if (owned) return { kind: "IDEAL", installer: toDTO(owned.i, owned.d) };

    // Priority 2: partners — distance is not the only factor (spec §9): preferred first, then distance
    const partners = inRange
      .sort((a, b) => {
        const pref = Number(b.i.preferredStatus === "PREFERRED") - Number(a.i.preferredStatus === "PREFERRED");
        return pref !== 0 ? pref : a.d - b.d;
      })
      .slice(0, 3);
    if (partners.length) return { kind: "PARTNERS", installers: partners.map((x) => toDTO(x.i, x.d)) };

    return { kind: "NONE" };
  },
};
