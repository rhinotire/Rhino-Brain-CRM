"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, isManager, locationScope } from "@/lib/auth";
import type { DealerOrderStatus } from "@prisma/client";

const ALLOWED: DealerOrderStatus[] = ["SUBMITTED", "CONFIRMED", "FULFILLED", "CANCELLED"];

/** Advance a portal order request. CONFIRMED means the rep keyed it into TireGuru. */
export async function updatePortalOrderStatus(id: string, status: string): Promise<{ ok: boolean; error?: string }> {
  const session = await requireSession();
  if (!isManager(session)) return { ok: false, error: "Only managers can update dealer orders." };
  if (!ALLOWED.includes(status as DealerOrderStatus)) return { ok: false, error: "Invalid status" };
  try {
    // company isolation: the order's customer must be in the manager's company
    const target = await db.dealerOrderRequest.findFirst({ where: { id, customer: { ...locationScope(session) } }, select: { id: true } });
    if (!target) return { ok: false, error: "Order not found in your company." };
    await db.dealerOrderRequest.update({ where: { id }, data: { status: status as DealerOrderStatus } });
    revalidatePath("/portal-orders");
    return { ok: true };
  } catch {
    return { ok: false, error: "Update failed" };
  }
}
