"use server";

import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, isManager, inLocation } from "@/lib/auth";
import { isValidRoutingNumber, type OnboardingData } from "@/lib/onboarding";
import type { ActionResult } from "./auth";

const BASE = process.env.TWILIO_WEBHOOK_BASE ?? "https://rhino-brain-crm.vercel.app";

/** Manager generates a 7-day tokenized link for the employee to fill on their phone. */
export async function createOnboardingInvite(employeeId: string): Promise<{ ok?: boolean; url?: string; error?: string }> {
  const session = await requireSession();
  if (!isManager(session)) return { error: "Managers only." };
  const emp = await db.employee.findUnique({ where: { id: employeeId }, select: { id: true, locationId: true } });
  if (!emp) return { error: "Employee not found." };
  if (!inLocation(session, emp.locationId)) return { error: "Not your company's employee." };

  // one PENDING invite at a time — a new link invalidates older unused ones
  await db.onboardingInvite.deleteMany({ where: { employeeId, status: "PENDING" } });
  const token = crypto.randomBytes(24).toString("hex");
  await db.onboardingInvite.create({
    data: { token, employeeId, expiresAt: new Date(Date.now() + 7 * 86400000) },
  });
  revalidatePath(`/hr/${employeeId}`);
  return { ok: true, url: `${BASE}/onboard/${token}` };
}

/** Public submit — the token IS the authorization; no session on this route. */
export async function submitOnboarding(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const token = String(formData.get("token") ?? "").slice(0, 64);
  if (!/^[0-9a-f]{48}$/.test(token)) return { ok: false, error: "Invalid link." };
  const invite = await db.onboardingInvite.findUnique({
    where: { token },
    include: { employee: { select: { id: true, name: true } } },
  });
  if (!invite || invite.status !== "PENDING" || invite.expiresAt < new Date()) {
    return { ok: false, error: "This link is invalid or expired — ask your manager for a new one." };
  }

  const g = (k: string, max = 120) => String(formData.get(k) ?? "").trim().slice(0, max);
  const routing = g("routingNumber", 9).replace(/\D/g, "");
  const account = g("accountNumber", 17).replace(/\D/g, "");
  const account2 = g("accountNumber2", 17).replace(/\D/g, "");
  const accountType = g("accountType", 10) === "savings" ? "savings" : "checking";

  if (g("legalName").length < 3) return { ok: false, error: "Enter your full legal name." };
  if (g("phone").replace(/\D/g, "").length < 10) return { ok: false, error: "Enter a valid phone number." };
  if (g("ecName").length < 2 || g("ecPhone").replace(/\D/g, "").length < 10)
    return { ok: false, error: "Emergency contact name and phone are required." };
  if (!isValidRoutingNumber(routing)) return { ok: false, error: "The routing number is not valid — please check it with your bank card or app." };
  if (!/^\d{4,17}$/.test(account)) return { ok: false, error: "The account number must be 4–17 digits." };
  if (account !== account2) return { ok: false, error: "The two account numbers do not match — please re-enter them." };
  if (formData.get("ack") !== "on") return { ok: false, error: "Please confirm the acknowledgment checkbox." };
  if (g("signature").length < 3) return { ok: false, error: "Type your full name as your signature." };

  const data: OnboardingData = {
    legalName: g("legalName"),
    phone: g("phone", 30),
    email: g("email"),
    address: g("address", 160),
    city: g("city", 60),
    state: g("state", 20),
    zip: g("zip", 10),
    ecName: g("ecName"),
    ecRelation: g("ecRelation", 40),
    ecPhone: g("ecPhone", 30),
    bankName: g("bankName", 80),
    routingNumber: routing,
    accountNumber: account,
    accountType,
    signature: g("signature"),
    signedAt: new Date().toISOString(),
  };

  await db.onboardingInvite.update({
    where: { id: invite.id },
    data: { status: "SUBMITTED", submittedAt: new Date(), data },
  });

  // bell every admin — the data is sitting in the vault waiting for payroll entry
  const admins = await db.user.findMany({ where: { role: "ADMIN", active: true }, select: { id: true } });
  await Promise.all(admins.map(a =>
    db.notification.create({
      data: {
        type: "TASK_DUE",
        title: `📋 Onboarding form submitted — ${invite.employee.name}`,
        body: "Direct deposit + emergency contact are in the employee's HR record.",
        link: `/hr/${invite.employee.id}`,
        userId: a.id,
      },
    }).catch(() => null),
  ));

  return { ok: true };
}
