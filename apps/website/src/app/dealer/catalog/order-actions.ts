"use server";

import { DealerOrderService, rateLimited, type DealerOrderResult } from "@rhino/services";
import { getDealerSession } from "@/lib/dealer-session";

export async function submitDealerOrder(input: {
  items: { sku: string; quantity: number }[];
  poNumber?: string;
  notes?: string;
}): Promise<DealerOrderResult> {
  const session = await getDealerSession();
  if (!session) return { ok: false, error: "Session expired — sign in again." };
  if (rateLimited(`dealer-order:${session.customerId}`)) {
    return { ok: false, error: "Too many submissions — wait a minute and try again." };
  }
  return DealerOrderService.submit(session, input);
}
