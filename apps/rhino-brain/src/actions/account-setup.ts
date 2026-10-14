"use server";

import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, canWrite, hasPerm } from "@/lib/auth";
import { uploadObject, isStorageConfigured } from "@/lib/storage";
import { isSmsConfigured, sendSms, smsFrom, toE164 } from "@/lib/twilio";
import type { ActionResult } from "./auth";

const BASE = process.env.TWILIO_WEBHOOK_BASE ?? "https://rhino-brain-crm.vercel.app";

async function scopedCustomer(sessionUserId: string, customerId: string) {
  return db.customer.findUnique({
    where: { id: customerId },
    select: {
      id: true, companyName: true, contactPerson: true, phone: true, contactCell: true,
      email: true, assignedRepId: true, locationId: true, location: { select: { shortTag: true, name: true } },
    },
  });
}

/** Create (replacing any pending) a 14-day account-application link for this customer. */
export async function createAccountInvite(customerId: string): Promise<{ ok?: boolean; url?: string; error?: string }> {
  const session = await requireSession();
  const customer = await scopedCustomer(session.userId, customerId);
  if (!customer) return { error: "Customer not found." };
  if (!canWrite(session, { locationId: customer.locationId, ownerId: customer.assignedRepId }))
    return { error: "Not your customer." };

  await db.accountSetupInvite.deleteMany({ where: { customerId, status: "PENDING" } });
  const token = crypto.randomBytes(24).toString("hex");
  await db.accountSetupInvite.create({
    data: { token, customerId, expiresAt: new Date(Date.now() + 14 * 86400000) },
  });
  revalidatePath(`/customers/${customerId}`);
  return { ok: true, url: `${BASE}/account-setup/${token}` };
}

/** Text the application link straight to the customer's cell. */
export async function textAccountInvite(customerId: string): Promise<{ ok?: boolean; error?: string }> {
  const session = await requireSession();
  if (!hasPerm(session, "phone")) return { error: "No phone/text permission." };
  if (!isSmsConfigured()) return { error: "Texting is not configured." };
  const customer = await scopedCustomer(session.userId, customerId);
  if (!customer) return { error: "Customer not found." };
  if (!canWrite(session, { locationId: customer.locationId, ownerId: customer.assignedRepId }))
    return { error: "Not your customer." };
  const to = toE164(customer.contactCell || customer.phone || "");
  if (!to) return { error: "No valid phone number on file." };
  const from = smsFrom(customer.location?.shortTag);
  if (!from) return { error: "No sending number for this company." };

  const inviteRes = await createAccountInvite(customerId);
  if (!inviteRes.ok || !inviteRes.url) return { error: inviteRes.error ?? "Could not create the link." };

  const brand = customer.location?.name ?? "Rhino Tire USA";
  await sendSms(to, `${brand}: Please complete your wholesale account application here: ${inviteRes.url} — takes about 3 minutes on your phone. Reply STOP to opt out.`, from);
  await db.activity.create({
    data: {
      type: "TEXT", subject: "Account application link sent",
      notes: "Online account-setup link texted to the customer.",
      customerId, repId: session.userId, locationId: customer.locationId, meaningful: true,
    },
  }).catch(() => {});
  return { ok: true };
}

const TYPE_OPTIONS = ["TIRE_SHOP", "CAR_DEALER", "TRAILER_MANUFACTURER", "FLEET", "REPAIR_SHOP", "WHOLESALE_DEALER", "ONLINE_BUYER", "OTHER"];

/** Public submit — the token is the authorization. Updates the customer record directly. */
export async function submitAccountSetup(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const token = String(formData.get("token") ?? "").slice(0, 64);
  if (!/^[0-9a-f]{48}$/.test(token)) return { ok: false, error: "Invalid link." };
  const invite = await db.accountSetupInvite.findUnique({
    where: { token },
    include: { customer: { select: { id: true, companyName: true, assignedRepId: true, locationId: true } } },
  });
  if (!invite || invite.status !== "PENDING" || invite.expiresAt < new Date()) {
    return { ok: false, error: "This link is invalid or expired — ask your sales rep for a new one." };
  }

  const g = (k: string, max = 120) => String(formData.get(k) ?? "").trim().slice(0, max);
  if (g("companyName").length < 2) return { ok: false, error: "Enter the legal business name." };
  if (g("contactPerson").length < 2) return { ok: false, error: "Enter the contact person." };
  if (formData.get("ack") !== "on") return { ok: false, error: "Please confirm the acknowledgment checkbox." };
  if (g("signature").length < 3) return { ok: false, error: "Type your full name as signature." };
  const type = TYPE_OPTIONS.includes(g("businessType", 40)) ? g("businessType", 40) : undefined;

  const data = {
    companyName: g("companyName"),
    dba: g("dba"),
    contactPerson: g("contactPerson"),
    title: g("title", 60),
    phone: g("phone", 30),
    contactCell: g("cell", 30),
    email: g("email"),
    address: g("address", 160),
    city: g("city", 60),
    state: g("state", 20),
    zip: g("zip", 10),
    businessType: type ?? g("businessType", 40),
    taxId: g("taxId", 40),
    signature: g("signature"),
    signedAt: new Date().toISOString(),
  };

  // resale certificate (photo or PDF) → customer documents, expiry armed
  const cert = formData.get("resaleCert");
  if (cert instanceof File && cert.size > 0) {
    if (cert.size > 8 * 1024 * 1024) return { ok: false, error: "Certificate file too large (max 8 MB)." };
    if (!["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(cert.type))
      return { ok: false, error: "Certificate must be a photo or PDF." };
    if (isStorageConfigured()) {
      const ext = cert.type === "application/pdf" ? "pdf" : "jpg";
      const storagePath = `${invite.customer.id}/RESALE_CERTIFICATE/${Date.now()}-online.${ext}`;
      await uploadObject(storagePath, await cert.arrayBuffer(), cert.type);
      const expRaw = g("certExpiry", 12);
      await db.customerDocument.create({
        data: {
          customerId: invite.customer.id, type: "RESALE_CERTIFICATE",
          fileName: `Resale certificate — submitted online.${ext}`,
          storagePath, fileSize: cert.size, mimeType: cert.type,
          expiresAt: /^\d{4}-\d{2}-\d{2}$/.test(expRaw) ? new Date(expRaw + "T12:00:00Z") : null,
          sensitive: false, uploadedById: null,
        },
      }).catch(() => {});
    }
  }

  await db.customer.update({
    where: { id: invite.customer.id },
    data: {
      companyName: data.companyName,
      contactPerson: data.contactPerson || undefined,
      phone: data.phone || undefined,
      contactCell: data.contactCell || undefined,
      email: data.email || undefined,
      address: data.address || undefined,
      city: data.city || undefined,
      state: data.state || undefined,
      zip: data.zip || undefined,
      taxId: data.taxId || undefined,
      ...(type ? { type: type as never } : {}),
    },
  });
  await db.accountSetupInvite.update({
    where: { id: invite.id },
    data: { status: "SUBMITTED", submittedAt: new Date(), data },
  });
  await db.activity.create({
    data: {
      type: "INTERNAL_NOTE", subject: "Account application submitted online",
      notes: `✅ Customer completed the online account form${data.taxId ? ` · Tax ID on file` : ""}${cert instanceof File && cert.size > 0 ? " · resale certificate uploaded" : ""}. Signed: ${data.signature}`,
      customerId: invite.customer.id,
      repId: invite.customer.assignedRepId ?? (await db.user.findFirst({ where: { role: "ADMIN", active: true }, select: { id: true } }))!.id,
      locationId: invite.customer.locationId, meaningful: true,
    },
  }).catch(() => {});

  // bell the rep (or admins)
  const notifyIds = invite.customer.assignedRepId
    ? [invite.customer.assignedRepId]
    : (await db.user.findMany({ where: { role: "ADMIN", active: true }, select: { id: true } })).map(u => u.id);
  await Promise.all(notifyIds.map(uid =>
    db.notification.create({
      data: {
        type: "CUSTOMER_NEEDS_CONTACT",
        title: `📋 Account application submitted — ${data.companyName}`,
        body: "Info + documents are on the customer page.",
        link: `/customers/${invite.customer.id}`,
        userId: uid,
      },
    }).catch(() => null),
  ));

  return { ok: true };
}
