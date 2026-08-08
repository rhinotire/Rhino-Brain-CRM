"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, isManager } from "@/lib/auth";
import type { DealerOrderStatus } from "@prisma/client";

const ALLOWED: DealerOrderStatus[] = ["SUBMITTED", "CONFIRMED", "FULFILLED", "CANCELLED"];

/** Advance a portal order request. CONFIRMED means the rep keyed it into TireGuru. */
export async function updatePortalOrderStatus(id: string, status: string): Promise<{ ok: boolean; error?: string }> {
  const session = await requireSession();
  if (!isManager(session)) return { ok: false, error: "Only managers can update dealer orders." };
  if (!ALLOWED.includes(status as DealerOrderStatus)) return { ok: false, error: "Invalid status" };
  try {
    await db.dealerOrderRequest.update({ where: { id }, data: { status: status as DealerOrderStatus } });
    revalidatePath("/portal-orders");
    return { ok: true };
  } catch {
    return { ok: false, error: "Update failed" };
  }
}
