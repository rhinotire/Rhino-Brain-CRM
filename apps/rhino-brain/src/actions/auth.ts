"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { createSession, destroySession } from "@/lib/auth";
import { loginSchema } from "@/lib/validations";

export type ActionResult = { ok: boolean; error?: string };

export async function login(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { ok: false, error: "Enter a valid email and password." };

  const user = await db.user.findUnique({ where: { email: parsed.data.email.toLowerCase() }, include: { assists: { select: { id: true } } } });
  if (!user || !user.active) return { ok: false, error: "Invalid email or password." };

  const match = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!match) return { ok: false, error: "Invalid email or password." };

  await createSession({ userId: user.id, role: user.role, name: user.name, email: user.email, locationId: user.locationId, assistIds: user.assists.map(a => a.id) });
  redirect(user.role === "ACCOUNTING" ? "/ar" : user.role === "SALES_REP" ? "/my-work" : "/dashboard");
}

export async function logout() {
  destroySession();
  redirect("/login");
}

export async function setLocationFilter(formData: FormData) {
  const { requireSession, setAdminLocFilterCookie } = await import("@/lib/auth");
  const session = await requireSession();
  if (session.role !== "ADMIN") return;
  const v = String(formData.get("locationId") || "");
  setAdminLocFilterCookie(v || null);
  const { revalidatePath } = await import("next/cache");
  revalidatePath("/", "layout");
}
