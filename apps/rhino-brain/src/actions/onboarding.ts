"use server";

import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, isManager, inLocation } from "@/lib/auth";
import { uploadEmployeeObject, isStorageConfigured } from "@/lib/storage";
import { isValidRoutingNumber, type OnboardingData } from "@/lib/onboarding";
import type { ActionResult } from "./auth";

/** Optional signed-form uploads from the public onboarding link. All land in
 *  the vault as sensitive (W-4/I-9 carry SSNs) with uploadedById = null. */
const UPLOAD_SLOTS = [
  { field: "w4File", type: "W4_FORM", label: "W-4" },
  { field: "i9File", type: "I9_FORM", label: "I-9" },
  { field: "dlFile", type: "DRIVER_LICENSE", label: "Driver license" },
] as const;
const UPLOAD_MAX = 4 * 1024 * 1024; // compressed photos are ~0.5MB; PDFs must fit the action body limit
const UPLOAD_MIME = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

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

  // signed-form photos/PDFs → employee vault (validated before anything is stored)
  const uploads: { slot: (typeof UPLOAD_SLOTS)[number]; file: File }[] = [];
  for (const slot of UPLOAD_SLOTS) {
    const f = formData.get(slot.field);
    if (!(f instanceof File) || f.size === 0) continue;
    if (f.size > UPLOAD_MAX) return { ok: false, error: `${slot.label}: file too large (max 4 MB) — a phone photo works best.` };
    if (!UPLOAD_MIME.includes(f.type)) return { ok: false, error: `${slot.label}: only photos or PDF files are accepted.` };
    uploads.push({ slot, file: f });
  }
  if (uploads.length > 0 && !isStorageConfigured()) {
    return { ok: false, error: "File uploads are unavailable right now — submit without files and hand the forms to your manager." };
  }
  for (const { slot, file } of uploads) {
    const ext = file.type === "application/pdf" ? "pdf" : file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const storagePath = `${invite.employee.id}/${slot.type}/${Date.now()}-onboard.${ext}`;
    await uploadEmployeeObject(storagePath, await file.arrayBuffer(), file.type);
    await db.employeeDocument.create({
      data: {
        employeeId: invite.employee.id,
        type: slot.type,
        fileName: `${slot.label} — submitted online ${new Date().toISOString().slice(0, 10)}.${ext}`,
        storagePath,
        fileSize: file.size,
        mimeType: file.type,
        sensitive: true, // W-4/I-9/DL all carry SSN or ID data
        uploadedById: null,
      },
    });
  }

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
