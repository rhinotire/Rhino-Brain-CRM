import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { db } from "./db";
import type { Role } from "@prisma/client";

const COOKIE = "tirepro_session";
const secret = () => new TextEncoder().encode(process.env.SESSION_SECRET || "dev-secret-change-me");

export type Session = { userId: string; role: Role; name: string; email: string; locationId?: string | null; assistIds?: string[] };

export async function createSession(s: Session) {
  const token = await new SignJWT(s)
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
    return payload as unknown as Session;
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

/** Re-check the user still exists and is active (used at login-sensitive spots). */
export async function getActiveUser(s: Session) {
  return db.user.findFirst({ where: { id: s.userId, active: true } });
}
