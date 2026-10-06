"use server";

import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";

/** Autosave the caller's personal scratchpad (visible only to them). */
export async function saveMyMemo(text: string): Promise<{ ok: boolean }> {
  const session = await requireSession();
  await db.user.update({
    where: { id: session.userId },
    data: { memo: String(text).slice(0, 8000) || null },
  });
  return { ok: true };
}
