import "server-only";
import { db } from "./db";
import { daysUntil } from "./ops";
import { effectivePerm } from "./permissions";

const etDay = (d: Date) => d.toLocaleDateString("en-US", { timeZone: "America/New_York" });

/** Task due/overdue bells for assignees — once per task per ET day. */
export async function generateTaskReminders(): Promise<void> {
  const now = new Date();
  const endOfToday = new Date(now); endOfToday.setHours(23, 59, 59, 999);
  const tasks = await db.task.findMany({
    where: { status: "OPEN", dueDate: { lte: endOfToday } },
    select: { id: true, title: true, dueDate: true, lastRemindedOn: true, assigneeId: true, customer: { select: { companyName: true } } },
    take: 300,
  });
  const due = tasks.filter(t => !t.lastRemindedOn || etDay(t.lastRemindedOn) !== etDay(now));
  for (const t of due) {
    const days = daysUntil(t.dueDate, now);
    await db.notification.create({
      data: {
        type: days < 0 ? "TASK_OVERDUE" : "TASK_DUE",
        title: days < 0 ? `🔴 Task overdue ${-days}d: ${t.title.slice(0, 70)}` : `📋 Task due today: ${t.title.slice(0, 70)}`,
        body: t.customer?.companyName,
        link: "/tasks",
        userId: t.assigneeId,
      },
    }).catch(() => null);
    await db.task.update({ where: { id: t.id }, data: { lastRemindedOn: now } }).catch(() => {});
  }
}

/** All lazy daily reminders — fired from the app layout on any page load. */
export async function generateDailyReminders(hasOpsPerm: boolean): Promise<void> {
  await generateTaskReminders().catch(() => {});
  if (hasOpsPerm) await generateOpsReminders().catch(() => {});
}

/**
 * Lazy reminder engine: called from the app layout for manager sessions, so it
 * runs many times a day without a cron — each due item bells its company's
 * managers at most once per ET day until it's renewed.
 */
export async function generateOpsReminders(): Promise<void> {
  const now = new Date();
  const horizon = new Date(now.getTime() + 180 * 86400000);
  const items = await db.opsItem.findMany({
    where: { status: "ACTIVE", dueDate: { lte: horizon } },
    select: { id: true, name: true, asset: true, dueDate: true, remindDays: true, lastRemindedOn: true, locationId: true },
    take: 200,
  });
  const due = items.filter(i =>
    daysUntil(i.dueDate, now) <= i.remindDays &&
    (!i.lastRemindedOn || etDay(i.lastRemindedOn) !== etDay(now)),
  );
  if (due.length === 0) return;

  // everyone with the ops permission (role default or granted "+ops", e.g. the GM)
  const candidates = await db.user.findMany({
    where: { active: true },
    select: { id: true, role: true, locationId: true, permissions: true },
  });
  const managers = candidates.filter(u => effectivePerm(u, "ops"));

  for (const item of due) {
    const days = daysUntil(item.dueDate, now);
    const title = days < 0
      ? `🔴 OVERDUE ${-days}d: ${item.name}`
      : `⏰ Due in ${days}d: ${item.name}`;
    const targets = managers.filter(m => m.role === "ADMIN" || m.locationId === item.locationId);
    await Promise.all(targets.map(m =>
      db.notification.create({
        data: { type: days < 0 ? "TASK_OVERDUE" : "TASK_DUE", title, body: item.asset ?? undefined, link: "/ops", userId: m.id },
      }).catch(() => null),
    ));
    await db.opsItem.update({ where: { id: item.id }, data: { lastRemindedOn: now } }).catch(() => {});
  }
}
