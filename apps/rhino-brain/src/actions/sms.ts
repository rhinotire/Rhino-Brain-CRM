"use server";

import { db } from "@/lib/db";
import { requireSession, hasPerm } from "@/lib/auth";
import { isSmsConfigured, sendSms, smsFrom, toE164 } from "@/lib/twilio";
import { fmtMoney } from "@/lib/domain";
import type { ActionResult } from "./auth";

/** Per-company signature + callback number for outbound texts. */
const BRAND: Record<string, { name: string; phone: string }> = {
  FL: { name: "Rhino Tire USA", phone: "(407) 777-5598" },
  TX: { name: "Everflow Tire", phone: "(972) 999-8422" },
};

export async function sendCustomerText(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const session = await requireSession();
  if (!hasPerm(session, "phone")) return { ok: false, error: "You don't have phone/text permission — ask the admin." };
  if (!isSmsConfigured()) return { ok: false, error: "Texting is not configured yet — ask the admin." };

  const customerId = String(formData.get("customerId") ?? "");
  const body = String(formData.get("body") ?? "").trim().slice(0, 1200);
  if (!customerId || body.length < 2) return { ok: false, error: "Write a message first." };

  const customer = await db.customer.findUnique({
    where: { id: customerId },
    select: {
      id: true, companyName: true, phone: true, contactCell: true, status: true,
      assignedRepId: true, locationId: true, location: { select: { shortTag: true } },
    },
  });
  if (!customer) return { ok: false, error: "Customer not found." };
  const inScope = session.role === "ADMIN" || session.role === "ACCOUNTING" || !customer.locationId || session.locationId === customer.locationId;
  const repOk = session.role !== "SALES_REP" || !customer.assignedRepId || customer.assignedRepId === session.userId;
  if (!inScope || !repOk) return { ok: false, error: "Not your customer." };
  if (customer.status === "DO_NOT_CONTACT") return { ok: false, error: "This customer is marked Do Not Contact." };

  const to = toE164(customer.contactCell || customer.phone || "");
  if (!to) return { ok: false, error: "No valid US phone number on file for this customer." };
  const from = smsFrom(customer.location?.shortTag);
  if (!from) return { ok: false, error: "No sending number configured for this company." };

  try {
    await sendSms(to, body, from);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? `Send failed: ${e.message}` : "Send failed." };
  }

  await db.activity.create({
    data: {
      type: "TEXT",
      subject: "Text message sent",
      notes: body,
      meaningful: true,
      customerId: customer.id,
      repId: session.userId,
      locationId: customer.locationId,
    },
  });
  await db.customer.update({ where: { id: customer.id }, data: { lastContactAt: new Date() } }).catch(() => {});
  return { ok: true };
}

/** Collection text with invoice detail (owner rule: never just a lump sum). */
export async function draftCollectionText(customerId: string): Promise<{ ok?: boolean; text?: string; error?: string }> {
  const session = await requireSession();
  const customer = await db.customer.findUnique({
    where: { id: customerId },
    select: {
      companyName: true, assignedRepId: true, locationId: true,
      location: { select: { shortTag: true } },
      invoices: {
        where: { balance: { gt: 0 }, dueDate: { lt: new Date() } },
        orderBy: { dueDate: "asc" },
        select: { invoiceNo: true, balance: true, dueDate: true },
        take: 8,
      },
    },
  });
  if (!customer) return { error: "Customer not found." };
  const inScope = session.role === "ADMIN" || session.role === "ACCOUNTING" || !customer.locationId || session.locationId === customer.locationId;
  const repOk = session.role !== "SALES_REP" || !customer.assignedRepId || customer.assignedRepId === session.userId;
  if (!inScope || !repOk) return { error: "Not your customer." };
  if (customer.invoices.length === 0) return { error: "No overdue invoices — nothing to collect." };

  const brand = BRAND[customer.location?.shortTag ?? "FL"] ?? BRAND.FL;
  const lines = customer.invoices
    .map(i => `${i.invoiceNo ? `#${i.invoiceNo}` : "Inv"} ${fmtMoney(Number(i.balance))} (due ${i.dueDate.toLocaleDateString("en-US", { month: "numeric", day: "numeric" })})`)
    .join(", ");
  const total = customer.invoices.reduce((s, i) => s + Number(i.balance), 0);
  return {
    ok: true,
    text:
      `${brand.name}: Hi ${customer.companyName}, friendly reminder — past-due invoices: ${lines}. ` +
      `Total ${fmtMoney(total)}. Please call us at ${brand.phone} or reply here to arrange payment. Thank you!`,
  };
}
