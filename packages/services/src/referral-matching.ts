import { db } from "@rhino/database";

/**
 * Existing-dealer matching for Send This Tire to My Installer (spec §11).
 * Conservative by design: certain → EXISTING_DEALER / EXISTING_INSTALLER,
 * similar → POSSIBLE_DUPLICATE (Sales Review), otherwise NEW_PROSPECT.
 * Never silently creates duplicates.
 */

export type MatchInput = {
  rawName?: string | null;
  rawPhone?: string | null;
  rawWebsite?: string | null;
  rawZip?: string | null;
};

export type MatchResult = {
  matchStatus: "EXISTING_DEALER" | "EXISTING_INSTALLER" | "POSSIBLE_DUPLICATE" | "NEW_PROSPECT";
  customerId?: string;
  installerId?: string;
  /** for routing: preserve the matched account's rep/company (spec §18) */
  assignedRepId?: string | null;
  locationId?: string | null;
  matchedName?: string;
};

/** last 10 digits, US-normalized */
export const phoneKey = (s?: string | null): string => {
  const d = (s ?? "").replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : "";
};

export const domainKey = (s?: string | null): string => {
  const v = (s ?? "").trim();
  if (!v || !v.includes(".")) return "";
  try {
    return new URL(v.includes("://") ? v : `https://${v}`).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
};

/** business-name key: drops generic tire-industry words + punctuation */
export const nameKey = (s?: string | null): string =>
  (s ?? "")
    .toLowerCase()
    .replace(/\b(tires?|wheels?|auto|automotive|shop|store|center|service|services|repair|llc|inc|corp|co|company|and|the|of)\b/g, "")
    .replace(/[^a-z0-9]/g, "");

export async function matchInstallerReferral(input: MatchInput): Promise<MatchResult> {
  const pk = phoneKey(input.rawPhone);
  const dk = domainKey(input.rawWebsite);
  const nk = nameKey(input.rawName);
  const zip = (input.rawZip ?? "").trim();

  // Installer table first (already-known shops, both companies)
  const installers = await db.installer.findMany({
    select: { id: true, storeName: true, phone: true, website: true, zip: true, assignedRepId: true, locationId: true, customerId: true },
  });
  for (const i of installers) {
    const hit =
      (pk && phoneKey(i.phone) === pk) ||
      (dk && domainKey(i.website) === dk) ||
      (nk.length >= 4 && nameKey(i.storeName) === nk && zip && i.zip === zip);
    if (hit) {
      return {
        matchStatus: i.customerId ? "EXISTING_DEALER" : "EXISTING_INSTALLER",
        installerId: i.id,
        customerId: i.customerId ?? undefined,
        assignedRepId: i.assignedRepId,
        locationId: i.locationId,
        matchedName: i.storeName,
      };
    }
  }

  // CRM customers (the ~1,366-record dealer base) — in-memory normalization,
  // phone formats in the DB are inconsistent
  const customers = await db.customer.findMany({
    where: { status: { not: "DO_NOT_CONTACT" } },
    select: { id: true, companyName: true, phone: true, contactCell: true, website: true, zip: true, assignedRepId: true, locationId: true },
  });

  let fuzzy: MatchResult | null = null;
  for (const c of customers) {
    const certain =
      (pk && (phoneKey(c.phone) === pk || phoneKey(c.contactCell) === pk)) ||
      (dk && domainKey(c.website) === dk) ||
      (nk.length >= 4 && nameKey(c.companyName) === nk && zip && c.zip === zip);
    if (certain) {
      return {
        matchStatus: "EXISTING_DEALER",
        customerId: c.id,
        assignedRepId: c.assignedRepId,
        locationId: c.locationId,
        matchedName: c.companyName,
      };
    }
    if (!fuzzy && nk.length >= 6) {
      const ck = nameKey(c.companyName);
      if (ck.length >= 6 && (ck === nk || ck.includes(nk) || nk.includes(ck))) {
        fuzzy = {
          matchStatus: "POSSIBLE_DUPLICATE",
          customerId: c.id,
          assignedRepId: c.assignedRepId,
          locationId: c.locationId,
          matchedName: c.companyName,
        };
      }
    }
  }
  return fuzzy ?? { matchStatus: "NEW_PROSPECT" };
}
