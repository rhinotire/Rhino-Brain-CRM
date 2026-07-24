"use server";

import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, isManager } from "@/lib/auth";

/**
 * Dealer portal account management (portal Phase 3). Reps manage logins for
 * their own customers; managers for any. Temp passwords are returned ONCE to
 * the UI for copy/paste — only the bcrypt hash is stored.
 */

type Result = { ok: boolean; error?: string; tempPassword?: string };

const tempPassword = () => {
  const words = ["Tire", "Wheel", "Rhino", "Trail", "Haul", "Road", "Grip", "Tread"];
  return `${words[randomInt(words.length)]}${words[randomInt(words.length)]}-${randomInt(1000, 9999)}`;
};

async function canManage(customerId: string): Promise<{ ok: boolean; error?: string }> {
  const session = await requireSession();
  if (isManager(session)) return { ok: true };
  const c = await db.customer.findUnique({ where: { id: customerId }, select: { assignedRepId: true } });
  if (!c) return { ok: false, error: "Customer not found" };
  if (c.assignedRepId !== session.userId) return { ok: false, error: "Not your customer" };
  return { ok: true };
}

export async function createDealerLogin(input: { customerId: string; name: string; email: string }): Promise<Result> {
  const gate = await canManage(input.customerId);
  if (!gate.ok) return gate;

  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Enter a contact name and a valid email." };
  if (await db.dealerUser.findUnique({ where: { email } })) return { ok: false, error: "That email already has a portal login." };

  const pw = tempPassword();
  await db.dealerUser.create({
    data: { customerId: input.customerId, name, email, passwordHash: await bcrypt.hash(pw, 10) },
  });
  revalidatePath(`/customers/${input.customerId}`);
  return { ok: true, tempPassword: pw };
}

export async function resetDealerPassword(dealerUserId: string): Promise<Result> {
  const u = await db.dealerUser.findUnique({ where: { id: dealerUserId }, select: { customerId: true } });
  if (!u) return { ok: false, error: "Login not found" };
  const gate = await canManage(u.customerId);
  if (!gate.ok) return gate;

  const pw = tempPassword();
  await db.dealerUser.update({ where: { id: dealerUserId }, data: { passwordHash: await bcrypt.hash(pw, 10) } });
  revalidatePath(`/customers/${u.customerId}`);
  return { ok: true, tempPassword: pw };
}

export async function setDealerActive(dealerUserId: string, active: boolean): Promise<Result> {
  const u = await db.dealerUser.findUnique({ where: { id: dealerUserId }, select: { customerId: true } });
  if (!u) return { ok: false, error: "Login not found" };
  const gate = await canManage(u.customerId);
  if (!gate.ok) return gate;

  await db.dealerUser.update({ where: { id: dealerUserId }, data: { active } });
  revalidatePath(`/customers/${u.customerId}`);
  return { ok: true };
}
