"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { overridesFromChecked, PERMISSIONS } from "@/lib/permissions";
import type { ActionResult } from "./auth";

/** ADMIN sets a user's module checkboxes; stored as minimal diffs vs role defaults. */
export async function updateUserPermissions(userId: string, checkedKeys: string[]): Promise<ActionResult> {
  const session = await requireSession();
  if (session.role !== "ADMIN") return { ok: false, error: "Only the admin can change permissions." };
  if (userId === session.userId) return { ok: false, error: "You can't change your own permissions." };
  const user = await db.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!user) return { ok: false, error: "User not found." };
  if (user.role === "ADMIN") return { ok: false, error: "Admins always have every module." };

  const valid = new Set(PERMISSIONS.map(p => p.key as string));
  const checked = checkedKeys.filter(k => valid.has(k));
  await db.user.update({
    where: { id: userId },
    data: { permissions: overridesFromChecked(user.role, checked) },
  });
  revalidatePath("/settings/users");
  return { ok: true };
}
