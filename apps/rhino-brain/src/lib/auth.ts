import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { db } from "./db";
import type { Role } from "@prisma/client";

const COOKIE = "tirepro_session";
const secret = () => {
  const s = process.env.SESSION_SECRET;
  // Security (docs/initial-audit.md finding 1): never run production on the dev fallback.
  if (!s && process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET must be set in production");
  return new TextEncoder().encode(s || "dev-secret-change-me");
};

export type Session = { userId: string; role: Role; name: string; email: string; locationId?: string | null; assistIds?: string[]; permissions?: string[] };

// ---- Module permissions: role defaults + per-user "+key"/"-key" overrides ----
// Registry lives in lib/permissions.ts (shared with the client-side checkbox UI).

import { effectivePerm, type PermKey } from "./permissions";
export type { PermKey };

export function hasPerm(s: Session, key: PermKey): boolean {
  return effectivePerm(s, key);
}

const VALID_ROLES = ["ADMIN", "MANAGER", "SALES_REP", "ACCOUNTING"] as const;

export async function createSession(s: Session) {
  // typ claim separates CRM staff tokens from any other JWT class (e.g. the
  // website's dealer-portal tokens) even if signing secrets were ever shared.
  const token = await new SignJWT({ ...s, typ: "crm" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .sign(secret());
  cookies().set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });
}

export function destroySession() {
  cookies().delete(COOKIE);
}

export async function getSession(): Promise<Session | null> {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    // Shape validation — a verified signature is not enough. Role guards and
    // scoping helpers fail OPEN on undefined role/userId, so a foreign token
    // class (dealer portal, future services) must never cast into a Session.
    const p = payload as Record<string, unknown>;
    if (typeof p.userId !== "string" || !p.userId) return null;
    if (!VALID_ROLES.includes(p.role as (typeof VALID_ROLES)[number])) return null;
    if (p.typ !== undefined && p.typ !== "crm") return null; // pre-typ staff tokens stay valid
    // Live authorization: role/location/active come from the DB on every
    // request, never from the token. A role change or deactivation takes
    // effect immediately — a stale cookie can't keep elevated access
    // (owner-reported incident: rep still saw the owner dashboard).
    const user = await db.user.findUnique({
      where: { id: p.userId },
      select: { role: true, active: true, name: true, email: true, locationId: true, permissions: true },
    });
    if (!user || !user.active) return null;
    return {
      userId: p.userId,
      role: user.role,
      name: user.name,
      email: user.email,
      locationId: user.locationId,
      permissions: user.permissions,
      assistIds: Array.isArray(p.assistIds) ? (p.assistIds as string[]) : undefined,
    };
  } catch {
    return null;
  }
}

/** Redirects to /login when there is no valid session. */
export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) redirect("/login");
  return s;
}

/** Redirects to a safe page when the user is not an admin/manager (blocks reps and accounting). */
export async function requireManager(): Promise<Session> {
  const s = await requireSession();
  if (s.role === "ACCOUNTING") redirect("/ar");
  if (s.role === "SALES_REP") redirect("/my-work");
  return s;
}

export const isManager = (s: Session) => s.role === "ADMIN" || s.role === "MANAGER";
export const isAccounting = (s: Session) => s.role === "ACCOUNTING";
/** Roles that see every location's data (admins + accounting), optionally via the sidebar filter. */
export const seesAllLocations = (s: Session) => s.role === "ADMIN" || s.role === "ACCOUNTING";
/** Roles that see all records, not just their own (managers + accounting). */
const seesAllReps = (s: Session) => isManager(s) || isAccounting(s);

/**
 * May this session create/modify a record with the given owner + company?
 * ADMIN: anything. ACCOUNTING: nothing (read-only). MANAGER: only their own company.
 * SALES_REP: only records they own (and in their company). Pass ownerId=null to skip the owner check.
 */
export function canWrite(s: Session, rec: { locationId?: string | null; ownerId?: string | null }): boolean {
  if (s.role === "ACCOUNTING") return false;
  if (s.role === "ADMIN") return true;
  if (rec.locationId && s.locationId && rec.locationId !== s.locationId) return false; // company isolation
  if (s.role === "SALES_REP" && rec.ownerId != null && rec.ownerId !== s.userId) return false; // reps: own only
  return true;
}

/** Redirects non-accounting/non-manager users away. */
export async function requireAccountingView(): Promise<Session> {
  const s = await requireSession();
  if (s.role === "SALES_REP") redirect("/my-work");
  return s;
}

/** Prisma `where` fragment that scopes reps to their own records (plus anyone they assist). */
export function repScope(s: Session, field = "assignedRepId") {
  if (seesAllReps(s)) return {};
  const ids = [s.userId, ...(s.assistIds ?? [])];
  return ids.length > 1 ? { [field]: { in: ids } } : { [field]: s.userId };
}

const LOC_COOKIE = "tirepro_loc";

/** Admin's currently selected location filter (cookie), or null = all locations. */
export function adminLocFilter(): string | null {
  return cookies().get(LOC_COOKIE)?.value || null;
}

export function setAdminLocFilterCookie(id: string | null) {
  if (id) cookies().set(LOC_COOKIE, id, { path: "/", maxAge: 60 * 60 * 24 * 365 });
  else cookies().delete(LOC_COOKIE);
}

/**
 * Prisma `where` fragment scoping records to the caller's location.
 * ADMIN: all locations, or the one selected in the sidebar switcher.
 * MANAGER / SALES_REP: locked to their own location.
 * Every scoped model (Customer, Lead, Quote, Task, Activity, Opportunity, Order) has `locationId`.
 */
export function locationScope(s: Session): { locationId?: string } {
  if (seesAllLocations(s)) {
    const f = adminLocFilter();
    return f ? { locationId: f } : {};
  }
  return s.locationId ? { locationId: s.locationId } : {};
}

/** The location a newly created record should belong to (non-admins locked to theirs). */
export function defaultLocationId(s: Session, requested?: string | null): string | null {
  if (s.role === "ADMIN") return requested || adminLocFilter() || null;
  return s.locationId ?? null;
}

/**
 * May this session READ a record belonging to the given company?
 * ADMIN/ACCOUNTING: yes (they see all locations). Others: own location only.
 * Use canWrite() for mutations — it additionally blocks ACCOUNTING.
 */
export function inLocation(s: Session, locationId: string | null | undefined): boolean {
  if (seesAllLocations(s)) return true;
  return !locationId || !s.locationId || locationId === s.locationId;
}

/**
 * Company scope for SINGLE-RECORD access by id (detail pages, per-record
 * mutations). Unlike locationScope, the admin sidebar FILTER is ignored —
 * it narrows lists, it must never 404 the owner out of a record they can
 * reach by id (bit us: freight create → redirect → 404 while filtered).
 */
export function ownLocationScope(s: Session): { locationId?: string } {
  if (seesAllLocations(s)) return {};
  return s.locationId ? { locationId: s.locationId } : {};
}

/** Re-check the user still exists and is active (used at login-sensitive spots). */
export async function getActiveUser(s: Session) {
  return db.user.findFirst({ where: { id: s.userId, active: true } });
}
