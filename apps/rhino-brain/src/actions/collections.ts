"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, canWrite, isManager, isAccounting, hasPerm } from "@/lib/auth";
import { sendEmail, isEmailConfigured } from "@rhino/services";
import { fmtMoney } from "@/lib/domain";
import type { ActionResult } from "./auth";

/**
 * One-click collection task from the A/R Collections view: assigned to the
 * customer's rep (falls back to the caller), due in 3 days, with the aging
 * breakdown in the description. Never stacks a second open collection task.
 */
export async function assignCollectionTask(customerId: string): Promise<ActionResult & { assignee?: string }> {
  const session = await requireSession();
  const customer = await db.customer.findUnique({
    where: { id: customerId },
    select: { id: true, companyName: true, locationId: true, assignedRepId: true, assignedRep: { select: { name: true, active: true } } },
  });
  if (!customer) return { ok: false, error: "Customer not found." };
  if (!canWrite(session, { locationId: customer.locationId })) return { ok: false, error: "Not your company's customer." };

  const now = new Date();
  const invoices = await db.invoice.findMany({
    where: { customerId, balance: { gt: 0 }, dueDate: { lt: now } },
    select: { balance: true, dueDate: true },
  });
  if (!invoices.length) return { ok: false, error: "No overdue balance — nothing to collect." };
  const total = invoices.reduce((s, i) => s + Number(i.balance), 0);
  const worstDays = Math.max(...invoices.map(i => Math.floor((now.getTime() - i.dueDate.getTime()) / 86400000)));

  const open = await db.task.findFirst({
    where: { customerId, status: "OPEN", title: { startsWith: "Collect " } },
    select: { id: true, assignee: { select: { name: true } } },
  });
  if (open) return { ok: false, error: `An open collection task already exists (assigned to ${open.assignee?.name ?? "someone"}).` };

  const assigneeId = (customer.assignedRep?.active && customer.assignedRepId) || session.userId;
  const due = new Date(now.getTime() + 3 * 86400000);
  await db.task.create({
    data: {
      title: `Collect ${fmtMoney(total)} overdue — ${customer.companyName}`,
      description: `A/R follow-up: ${invoices.length} overdue item(s), oldest ${worstDays} days past due. Call, confirm a payment date, log the outcome.`,
      dueDate: due,
      priority: worstDays > 90 ? "HIGH" : "MEDIUM",
      customerId,
      assigneeId,
      creatorId: session.userId,
      locationId: customer.locationId,
    },
  });
  if (assigneeId !== session.userId) {
    await db.notification.create({
      data: {
        type: "TASK_DUE",
        title: `Collection task: ${customer.companyName}`,
        body: `${fmtMoney(total)} overdue (oldest ${worstDays} days). Due ${due.toLocaleDateString("en-US", { timeZone: "America/New_York" })}.`,
        link: "/tasks",
        userId: assigneeId,
      },
    });
  }
  revalidatePath("/ar/collections");
  revalidatePath("/tasks");
  const assigneeName = assigneeId === session.userId ? "you" : customer.assignedRep?.name ?? "the rep";
  return { ok: true, assignee: assigneeName };
}

/**
 * Send the reviewed collection email straight from the brand mailbox.
 * CC: the AR/finance mailbox when AR_FINANCE_EMAIL is set; Reply-To: the sender,
 * so customer replies land with the person doing the collecting.
 */
export async function sendCollectionEmail(customerId: string, subject: string, body: string): Promise<ActionResult> {
  const session = await requireSession();
  const s = subject.trim().slice(0, 200);
  const b = body.trim().slice(0, 8000);
  if (!s || !b) return { ok: false, error: "Draft the email first." };

  const customer = await db.customer.findUnique({
    where: { id: customerId },
    select: { companyName: true, email: true, locationId: true, assignedRepId: true },
  });
  if (!customer) return { ok: false, error: "Customer not found." };
  if (!canWrite(session, { locationId: customer.locationId })) return { ok: false, error: "Not your company's customer." };
  if (session.role === "SALES_REP" && customer.assignedRepId !== session.userId) return { ok: false, error: "Not your customer." };
  if (!customer.email) return { ok: false, error: "This customer has no email on file — add one on the customer page first." };

  const brand = customer.locationId ? await db.brandConfig.findFirst({ where: { locationId: customer.locationId } }) : null;
  if (!isEmailConfigured(brand?.key)) {
    return { ok: false, error: `Email isn't set up for this company yet — admin: add ZOHO_SMTP_USER_${brand?.key ?? "RHINO"} / ZOHO_SMTP_PASS_${brand?.key ?? "RHINO"}. Use Copy for now.` };
  }

  const financeCc = process.env.AR_FINANCE_EMAIL?.trim() || undefined;
  const res = await sendEmail(customer.email, s, b, {
    mailboxKey: brand?.key,
    cc: financeCc,
    replyTo: session.email,
  });
  if (!res.sent) return { ok: false, error: "Email failed to send — check mail settings, or use Copy." };

  await db.activity.create({
    data: {
      type: "EMAIL",
      subject: `Collection email sent to ${customer.email}`,
      notes: s,
      customerId, repId: session.userId, locationId: customer.locationId, meaningful: true,
    },
  });
  await db.customer.update({ where: { id: customerId }, data: { lastContactAt: new Date() } });
  revalidatePath("/ar/collections");
  return { ok: true };
}

/**
 * Bad-debt write-off (owner request 2026-10-17): mark a closed/defunct
 * customer so their balances leave the A/R aging stats and collections queue.
 * Reversible, audited (who/when/why + an Activity note). Managers/accounting
 * with the A/R permission only.
 */
export async function setCustomerWriteOff(
  customerId: string,
  writeOff: boolean,
  note?: string
): Promise<ActionResult> {
  const session = await requireSession();
  if (!hasPerm(session, "ar") || !(isManager(session) || isAccounting(session)))
    return { ok: false, error: "Only managers/accounting can write off balances." };
  const customer = await db.customer.findUnique({
    where: { id: customerId },
    select: { id: true, companyName: true, locationId: true },
  });
  if (!customer) return { ok: false, error: "Customer not found." };
  if (!canWrite(session, { locationId: customer.locationId })) return { ok: false, error: "Not your company's customer." };

  await db.customer.update({
    where: { id: customerId },
    data: writeOff
      ? { arWriteOffAt: new Date(), arWriteOffById: session.userId, arWriteOffNote: note?.trim().slice(0, 300) || null }
      : { arWriteOffAt: null, arWriteOffById: null, arWriteOffNote: null },
  });
  await db.activity.create({
    data: {
      type: "INTERNAL_NOTE",
      subject: writeOff ? "💀 A/R written off — closed/uncollectable" : "A/R write-off REVERSED — balances back in aging",
      notes: note?.trim() || undefined,
      customerId,
      repId: session.userId,
      locationId: customer.locationId,
      meaningful: true,
    },
  }).catch(() => {});
  revalidatePath("/ar");
  revalidatePath("/ar/collections");
  revalidatePath(`/customers/${customerId}`);
  return { ok: true };
}

/**
 * Write off an A/R name that has NO CRM customer record (TireGuru INACTIVE
 * customers were never imported — VARIIS WHEELS case, 2026-10-19). Creates a
 * minimal INACTIVE customer archive carrying the write-off flag and links the
 * name's invoices; future aging syncs re-match it by name, so the write-off
 * sticks.
 */
export async function writeOffUnmatchedAr(
  customerName: string,
  locationId: string,
  note?: string
): Promise<ActionResult> {
  const session = await requireSession();
  if (!hasPerm(session, "ar") || !(isManager(session) || isAccounting(session)))
    return { ok: false, error: "Only managers/accounting can write off balances." };
  const name = customerName.trim();
  if (!name) return { ok: false, error: "Missing customer name." };
  if (!canWrite(session, { locationId })) return { ok: false, error: "Not your company's customer." };

  let customer = await db.customer.findFirst({
    where: { companyName: { equals: name, mode: "insensitive" }, locationId },
  });
  if (!customer) {
    customer = await db.customer.create({
      data: {
        companyName: name,
        locationId,
        status: "INACTIVE", // mirrors TireGuru — these are closed/inactive accounts
        notes: "Auto-created from A/R write-off (no CRM record existed; TireGuru-only name).",
      },
    });
  }
  await db.customer.update({
    where: { id: customer.id },
    data: { arWriteOffAt: new Date(), arWriteOffById: session.userId, arWriteOffNote: note?.trim().slice(0, 300) || null },
  });
  await db.invoice.updateMany({
    where: { customerId: null, locationId, customerName: { equals: name, mode: "insensitive" } },
    data: { customerId: customer.id },
  });
  await db.activity.create({
    data: {
      type: "INTERNAL_NOTE",
      subject: "💀 A/R written off — closed/uncollectable (record auto-created)",
      notes: note?.trim() || undefined,
      customerId: customer.id,
      repId: session.userId,
      locationId,
      meaningful: true,
    },
  }).catch(() => {});
  revalidatePath("/ar");
  revalidatePath("/ar/collections");
  return { ok: true };
}
