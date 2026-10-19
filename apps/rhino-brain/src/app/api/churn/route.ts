import { NextResponse } from "next/server";
import { addDays, subDays } from "date-fns";
import { db } from "@/lib/db";

// RHINO BRAIN workbench → CRM: churn / declining / quiet customers from TireGuru sales data.
// The workbench posts the current at-risk list once a day (and on demand). For each customer we
//   1. match a CRM customer by normalized company name (exact after stripping LLC / INC / punctuation),
//   2. make sure the assigned rep has ONE open REACTIVATION task tagged "[RHINO BRAIN]" (create if missing),
//   3. cancel our open tasks for customers that dropped off the list (they bought again),
//   4. report back the task state and the rep's latest logged activity so the workbench can show "contacted on … by …".
// Auth: Authorization: Bearer CHURN_SYNC_TOKEN (same value on both Vercel projects).

export const runtime = "nodejs";
export const maxDuration = 60;

const TAG = "[RHINO BRAIN]";
const STATUS_EN: Record<string, string> = { 流失: "Lost (no order 45d+)", 下滑: "Declining (−50% vs avg)", 沉默: "Quiet (no order 21d+)" };

interface InCustomer {
  key: string;
  name: string;
  city?: string;
  state?: string;
  phone?: string;
  status: string; // 流失 / 下滑 / 沉默
  daysSince?: number | null;
  avg?: number; // monthly average $
  lastSale?: string; // YYYY-MM-DD
  slm?: string; // TireGuru salesperson code
  loc?: string;
}

interface OutCustomer {
  key: string;
  crmCustomerId: string | null;
  crmName: string | null;
  matched: boolean;
  ambiguous: boolean;
  taskId: string | null;
  taskStatus: string | null; // OPEN / COMPLETED / CANCELED
  taskDue: string | null;
  assignee: string | null;
  lastContactAt: string | null;
  lastActivity: { at: string; type: string; rep: string; outcome: string | null; subject: string; notes: string | null } | null;
}

/** "Rhino Tire USA, LLC." → "RHINO TIRE USA" — same rule the workbench uses (lib/calc/crmsync.ts normCompany) */
const normCompany = (s: string | null | undefined): string =>
  String(s ?? "").toUpperCase().replace(/&/g, " AND ").replace(/[^A-Z0-9]+/g, " ").replace(/\b(LLC|INC|CO|LTD|CORP|CORPORATION|COMPANY|LIMITED|DBA|THE)\b/g, " ").replace(/\s+/g, " ").trim();

export async function POST(req: Request) {
  const token = process.env.CHURN_SYNC_TOKEN;
  if (!token || req.headers.get("authorization") !== `Bearer ${token}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { customers?: InCustomer[]; dryRun?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const incoming = (body.customers ?? []).filter((c) => c && c.key && c.name && STATUS_EN[c.status]).slice(0, 2000);
  const dryRun = !!body.dryRun;

  const [customers, admins] = await Promise.all([
    db.customer.findMany({
      where: { status: { notIn: ["DO_NOT_CONTACT"] } },
      select: { id: true, companyName: true, locationId: true, lastContactAt: true, assignedRepId: true, assignedRep: { select: { id: true, name: true, active: true } } },
    }),
    db.user.findMany({ where: { active: true, role: { in: ["ADMIN", "MANAGER"] } }, select: { id: true, name: true, role: true, locationId: true }, orderBy: { createdAt: "asc" } }),
  ]);
  const byName = new Map<string, typeof customers>();
  for (const c of customers) { const k = normCompany(c.companyName); if (!k) continue; (byName.get(k) ?? byName.set(k, []).get(k)!).push(c); }
  const systemUser = admins.find((a) => a.role === "ADMIN") ?? admins[0];
  if (!systemUser) return NextResponse.json({ error: "no admin user to create tasks as" }, { status: 500 });
  const fallbackAssignee = (locationId: string | null) => admins.find((a) => a.role === "MANAGER" && a.locationId === locationId) ?? admins.find((a) => a.role === "ADMIN" && (a.locationId == null || a.locationId === locationId)) ?? systemUser;

  const openTasks = await db.task.findMany({
    where: { status: "OPEN", type: "REACTIVATION", title: { startsWith: TAG }, customerId: { not: null } },
    select: { id: true, customerId: true, dueDate: true, assignee: { select: { name: true } } },
  });
  const openByCustomer = new Map(openTasks.map((t) => [t.customerId as string, t]));
  const now = new Date();
  // A task the rep completed in the last 14 days counts as handled: don't open another one while the customer is still on the list
  const recentDone = await db.task.findMany({
    where: { status: "COMPLETED", type: "REACTIVATION", title: { startsWith: TAG }, customerId: { not: null }, completedAt: { gte: subDays(now, 14) } },
    orderBy: { completedAt: "desc" },
    select: { id: true, customerId: true, completedAt: true, assignee: { select: { name: true } } },
  });
  const doneByCustomer = new Map<string, (typeof recentDone)[number]>();
  for (const t of recentDone) if (!doneByCustomer.has(t.customerId as string)) doneByCustomer.set(t.customerId as string, t);
  const out: OutCustomer[] = [];
  let created = 0, kept = 0, canceled = 0, unmatched = 0, ambiguous = 0;
  const touchedCustomerIds = new Set<string>();

  for (const c of incoming) {
    const cands = byName.get(normCompany(c.name)) ?? [];
    if (cands.length !== 1) {
      if (cands.length > 1) ambiguous++; else unmatched++;
      out.push({ key: c.key, crmCustomerId: null, crmName: cands[0]?.companyName ?? null, matched: false, ambiguous: cands.length > 1, taskId: null, taskStatus: null, taskDue: null, assignee: null, lastContactAt: null, lastActivity: null });
      continue;
    }
    const cust = cands[0];
    touchedCustomerIds.add(cust.id);
    let task = openByCustomer.get(cust.id) ?? null;
    let taskStatus: string | null = task ? "OPEN" : null;
    const done = !task ? doneByCustomer.get(cust.id) : undefined;
    if (done) {
      task = { id: done.id, customerId: done.customerId, dueDate: done.completedAt ?? now, assignee: done.assignee };
      taskStatus = "COMPLETED";
      kept++;
    } else if (!task && !dryRun) {
      const assignee = cust.assignedRep?.active ? cust.assignedRep : fallbackAssignee(cust.locationId);
      const due = addDays(now, c.status === "流失" ? 1 : 2);
      const lines = [
        `${STATUS_EN[c.status]} — flagged by RHINO BRAIN from TireGuru sales.`,
        c.avg ? `Avg monthly purchases: $${Math.round(c.avg).toLocaleString("en-US")}` : null,
        c.lastSale ? `Last purchase: ${c.lastSale}${c.daysSince != null ? ` (${c.daysSince} days ago)` : ""}` : "Last purchase: unknown",
        c.phone ? `Phone (TireGuru): ${c.phone}` : null,
        c.slm ? `TireGuru salesperson: ${c.slm}` : null,
        "Call them, log the call on the customer, then complete this task.",
      ].filter(Boolean).join("\n");
      const t = await db.task.create({
        data: {
          title: `${TAG} ${c.status === "流失" ? "Win back" : c.status === "下滑" ? "Buying less" : "Gone quiet"}: ${cust.companyName}`,
          description: lines,
          dueDate: due,
          priority: c.status === "流失" ? "HIGH" : "MEDIUM",
          status: "OPEN",
          type: "REACTIVATION",
          customerId: cust.id,
          assigneeId: assignee.id,
          creatorId: systemUser.id,
          locationId: cust.locationId,
        },
        select: { id: true, customerId: true, dueDate: true, assignee: { select: { name: true } } },
      });
      await db.notification.create({
        data: { type: "CUSTOMER_NEEDS_CONTACT", title: `Win-back: ${cust.companyName}`, body: `${STATUS_EN[c.status]}. Task due ${due.toLocaleDateString("en-US", { timeZone: "America/New_York" })}.`, link: "/tasks", userId: assignee.id },
      });
      task = t;
      taskStatus = "OPEN";
      openByCustomer.set(cust.id, t);
      created++;
    } else if (task) kept++;
    // Latest logged activity in the last 60 days (what the rep actually did)
    const act = await db.activity.findFirst({
      where: { customerId: cust.id, occurredAt: { gte: subDays(now, 60) } },
      orderBy: { occurredAt: "desc" },
      select: { occurredAt: true, type: true, outcome: true, subject: true, notes: true, rep: { select: { name: true } } },
    });
    out.push({
      key: c.key, crmCustomerId: cust.id, crmName: cust.companyName, matched: true, ambiguous: false,
      taskId: task?.id ?? null, taskStatus, taskDue: task?.dueDate.toISOString().slice(0, 10) ?? null, assignee: task?.assignee.name ?? cust.assignedRep?.name ?? null,
      lastContactAt: cust.lastContactAt?.toISOString() ?? null,
      lastActivity: act ? { at: act.occurredAt.toISOString(), type: act.type, rep: act.rep.name, outcome: act.outcome, subject: act.subject, notes: act.notes ? act.notes.slice(0, 200) : null } : null,
    });
  }

  // Customers that left the list (bought again): close our open tasks so reps don't chase them
  if (!dryRun) {
    for (const t of openTasks) {
      if (touchedCustomerIds.has(t.customerId as string)) continue;
      await db.task.update({ where: { id: t.id }, data: { status: "CANCELED" } });
      canceled++;
    }
  }
  return NextResponse.json({ ok: true, received: incoming.length, created, kept, canceled, unmatched, ambiguous, dryRun, customers: out });
}
