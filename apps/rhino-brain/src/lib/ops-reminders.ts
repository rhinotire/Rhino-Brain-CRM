import "server-only";
import { db } from "./db";
import { daysUntil } from "./ops";
import { effectivePerm } from "./permissions";

const etDay = (d: Date) => d.toLocaleDateString("en-US", { timeZone: "America/New_York" });

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
