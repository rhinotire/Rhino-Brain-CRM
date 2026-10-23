"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, hasPerm, locationScope } from "@/lib/auth";
import type { ActionResult } from "./auth";

/** The user's competitor set: Everflow (TX) users watch the Dallas rivals,
 * everyone else the Rhino rivals. */
export async function companyFor(session: Awaited<ReturnType<typeof requireSession>>): Promise<"RHINO" | "EVERFLOW"> {
  const locId = locationScope(session).locationId ?? session.locationId;
  if (!locId) return "RHINO";
  const loc = await db.location.findUnique({ where: { id: locId }, select: { shortTag: true } });
  return loc?.shortTag === "TX" ? "EVERFLOW" : "RHINO";
}

/** Queue a live competitor lookup for a size not yet watched — the owner's PC
 * robot drains the queue within ~5 minutes and the size joins the daily watch. */
export async function queueCompetitorLookup(sizeText: string): Promise<ActionResult & { queued?: string }> {
  const session = await requireSession();
  if (!hasPerm(session, "products")) return { ok: false, error: "Not allowed." };
  const company = await companyFor(session);
  const display = sizeText.trim().slice(0, 30);
  const sizeKey = display.replace(/-?\s*\d+\s*PR\b/i, "").replace(/\D/g, "");
  if (sizeKey.length < 5 || sizeKey.length > 10) return { ok: false, error: "That doesn't look like a tire size." };
  const existing = await db.competitorLookup.findFirst({ where: { sizeKey, status: "PENDING", company } });
  if (!existing) await db.competitorLookup.create({ data: { sizeKey, display, company } });
  revalidatePath("/competitors");
  return { ok: true, queued: display };
}
