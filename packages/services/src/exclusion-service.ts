import { db } from "@rhino/database";
import { domainKey, nameKey, phoneKey } from "./referral-matching";

/**
 * Protection pool gate (spec §8.1). isExcluded() MUST be called before any
 * outreach send and before creating leads from collectors. Matching is
 * conservative-inclusive: domain OR phone OR (nameKey when the row has no
 * stronger identifier) → excluded.
 */
export type ExclusionRow = {
  kind: string;
  companyName: string;
  domain: string | null;
  phone: string | null;
};

export function matchesExclusion(
  candidate: { companyName?: string | null; website?: string | null; phone?: string | null },
  rows: ExclusionRow[]
): ExclusionRow | null {
  const cd = domainKey(candidate.website);
  const cp = phoneKey(candidate.phone);
  const cn = nameKey(candidate.companyName);
  for (const r of rows) {
    if (r.domain && cd && r.domain === cd) return r;
    if (r.phone && cp && r.phone === cp) return r;
    if (!r.domain && !r.phone) {
      const rn = nameKey(r.companyName);
      if (rn.length >= 4 && rn === cn) return r;
    }
  }
  return null;
}

export async function isExcluded(candidate: {
  companyName?: string | null;
  website?: string | null;
  phone?: string | null;
}): Promise<ExclusionRow | null> {
  const rows = await db.exclusionList.findMany({
    select: { kind: true, companyName: true, domain: true, phone: true },
  });
  return matchesExclusion(candidate, rows);
}

/** Rep-facing blacklist check (bad credit / unpaid debt / fraud — owner rule):
 * matches ONLY kind=BLACKLIST rows, so protecting a good customer from cold
 * outreach never paints them as a deadbeat. Surface the result as a red
 * warning wherever reps see the company. */
export async function findBlacklistMatch(candidate: {
  companyName?: string | null;
  website?: string | null;
  phone?: string | null;
}): Promise<(ExclusionRow & { reason?: string | null }) | null> {
  const rows = await db.exclusionList.findMany({
    where: { kind: "BLACKLIST" },
    select: { kind: true, companyName: true, domain: true, phone: true, reason: true },
  });
  const hit = matchesExclusion(candidate, rows);
  return hit ? (hit as ExclusionRow & { reason?: string | null }) : null;
}

export async function addExclusion(input: {
  kind: "EXISTING_CUSTOMER" | "AGENT" | "COMPETITOR" | "OPTED_OUT" | "RISK" | "BLACKLIST";
  companyName: string;
  website?: string | null;
  phone?: string | null;
  reason?: string;
  addedById?: string;
}): Promise<void> {
  await db.exclusionList.create({
    data: {
      kind: input.kind,
      companyName: input.companyName.trim(),
      domain: domainKey(input.website) || null,
      phone: phoneKey(input.phone) || null,
      reason: input.reason ?? null,
      addedById: input.addedById ?? null,
    },
  });
}
