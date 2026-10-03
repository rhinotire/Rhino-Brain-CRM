import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import type { DealerIdentity } from "@rhino/services";

/**
 * Dealer portal session — mirrors apps/rhino-brain/src/lib/auth.ts but with its
 * own cookie and payload so dealer logins and internal CRM logins can never be
 * confused (architecture.md trust tiers).
 */

const COOKIE = "dealer_session";
const secret = () => {
  const s = process.env.DEALER_SESSION_SECRET ?? process.env.SESSION_SECRET;
  if (!s && process.env.NODE_ENV === "production") throw new Error("DEALER_SESSION_SECRET must be set in production");
  return new TextEncoder().encode(s || "dev-secret-change-me");
};

export type DealerSession = DealerIdentity;

export async function createDealerSession(s: DealerSession) {
  // typ claim: a dealer token must never be usable as anything else
  const token = await new SignJWT({ ...s, typ: "dealer" })
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

export function destroyDealerSession() {
  cookies().delete(COOKIE);
}

export async function getDealerSession(): Promise<DealerSession | null> {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    // shape validation: reject any verified JWT that isn't a dealer token
    // (e.g. a CRM staff token when secrets are shared via the fallback)
    const p = payload as Record<string, unknown>;
    if (typeof p.dealerUserId !== "string" || typeof p.customerId !== "string") return null;
    if (p.typ !== undefined && p.typ !== "dealer") return null; // pre-typ dealer tokens stay valid
    return payload as unknown as DealerSession;
  } catch {
    return null;
  }
}
