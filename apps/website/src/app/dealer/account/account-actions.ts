"use server";

import { DealerAuthService, rateLimited } from "@rhino/services";
import { getDealerSession } from "@/lib/dealer-session";

export async function changeDealerPassword(currentPassword: string, newPassword: string): Promise<{ ok: boolean; error?: string }> {
  const session = await getDealerSession();
  if (!session) return { ok: false, error: "Session expired — sign in again." };
  if (rateLimited(`dealer-pw:${session.dealerUserId}`)) {
    return { ok: false, error: "Too many attempts — wait a minute." };
  }
  return DealerAuthService.changePassword(session.dealerUserId, currentPassword, newPassword);
}
