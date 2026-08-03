// HR document rules — pure logic shared by rhino-brain pages and server
// actions. Doc-type labels/lists live client-safe in the app's lib/domain.ts.

export type DocExpiryStatus = "ok" | "expiring" | "expired";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/** red = expired, yellow = expires within 30 days (owner decision 2026-08-01). */
export function docExpiryStatus(expiresAt: Date | null | undefined, now: Date = new Date()): DocExpiryStatus {
  if (!expiresAt) return "ok";
  const delta = expiresAt.getTime() - now.getTime();
  if (delta < 0) return "expired";
  if (delta <= THIRTY_DAYS_MS) return "expiring";
  return "ok";
}

/** Worst status across an employee's documents (expired > expiring > ok). */
export function worstExpiryStatus(expirations: (Date | null | undefined)[], now: Date = new Date()): DocExpiryStatus {
  let worst: DocExpiryStatus = "ok";
  for (const e of expirations) {
    const s = docExpiryStatus(e, now);
    if (s === "expired") return "expired";
    if (s === "expiring") worst = "expiring";
  }
  return worst;
}

/** Sensitive docs (license / work permit / bank info) open for ADMIN only. */
export function canDownloadEmployeeDoc(role: string, sensitive: boolean): boolean {
  if (sensitive) return role === "ADMIN";
  return role === "ADMIN" || role === "MANAGER";
}

export function canDeleteEmployeeDoc(role: string): boolean {
  return role === "ADMIN";
}

/** How many of the given core doc types have an unexpired copy on file. */
export function coreDocsOnFile(
  docs: { type: string; expiresAt: Date | null }[],
  coreTypes: readonly string[],
  now: Date = new Date(),
): number {
  return coreTypes.filter(t =>
    docs.some(d => d.type === t && docExpiryStatus(d.expiresAt, now) !== "expired")
  ).length;
}
