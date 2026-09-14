"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, canWrite } from "@/lib/auth";
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
