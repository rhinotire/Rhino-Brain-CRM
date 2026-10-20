"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, hasPerm, isManager, isAccounting } from "@/lib/auth";
import type { ActionResult } from "./auth";

/** Queue a live competitor lookup for a size not yet watched — the owner's PC
 * robot drains the queue within ~5 minutes and the size joins the daily watch. */
export async function queueCompetitorLookup(sizeText: string): Promise<ActionResult & { queued?: string }> {
  const session = await requireSession();
  if (!hasPerm(session, "products") || !(isManager(session) || isAccounting(session)))
    return { ok: false, error: "Not allowed." };
  const display = sizeText.trim().slice(0, 30);
  const sizeKey = display.replace(/-?\s*\d+\s*PR\b/i, "").replace(/\D/g, "");
  if (sizeKey.length < 5 || sizeKey.length > 10) return { ok: false, error: "That doesn't look like a tire size." };
  const existing = await db.competitorLookup.findFirst({ where: { sizeKey, status: "PENDING" } });
  if (!existing) await db.competitorLookup.create({ data: { sizeKey, display } });
  revalidatePath("/competitors");
  return { ok: true, queued: display };
}
