import { domainKey, nameKey, phoneKey } from "./referral-matching";

/**
 * Stable identity key for a prospect so re-running collectors never creates
 * duplicates (Lead.dedupeKey is @unique). Priority: domain > phone > name+city.
 * "" means "not dedupable" — caller must NOT write "" into the unique column.
 */
export function dedupeKeyFor(input: {
  website?: string | null;
  phone?: string | null;
  companyName?: string | null;
  city?: string | null;
}): string {
  const d = domainKey(input.website);
  if (d) return `d:${d}`;
  const p = phoneKey(input.phone);
  if (p) return `p:${p}`;
  const n = nameKey(input.companyName);
  const city = (input.city ?? "").trim().toLowerCase();
  if (n.length >= 4 && city) return `n:${n}:${city}`;
  return "";
}
