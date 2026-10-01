import { redirect } from "next/navigation";
import { subDays } from "date-fns";
import { db } from "@/lib/db";
import { requireSession, isAccounting, repScope, locationScope } from "@/lib/auth";
import { FieldList, type FieldCard } from "@/components/field-route";

export const dynamic = "force-dynamic";

/**
 * Field Mode — the outside-sales phone homepage. One card per customer worth
 * visiting today: open tasks, due follow-ups, then accounts going cold.
 * Every card carries the numbers a rep should know before walking in.
 */
export default async function FieldPage() {
  const session = await requireSession();
  if (isAccounting(session)) redirect("/ar");
  const now = new Date();
  const endOfToday = new Date(now); endOfToday.setHours(23, 59, 59, 999);
  const repTaskFilter = session.role === "SALES_REP" ? { assigneeId: session.userId } : {};

  const customers = await db.customer.findMany({
    where: {
      ...repScope(session),
      ...locationScope(session),
      status: { in: ["ACTIVE", "PROSPECT", "LEAD"] },
      OR: [
        { tasks: { some: { status: "OPEN", dueDate: { lte: endOfToday }, ...repTaskFilter } } },
        { nextFollowUpAt: { lte: endOfToday } },
        { lastContactAt: { lt: subDays(now, 14) } },
        { lastContactAt: null },
      ],
    },
    include: {
      invoices: { where: { balance: { gt: 0 }, dueDate: { lt: now } }, select: { balance: true } },
      orders: { orderBy: { orderDate: "desc" }, take: 1, select: { orderDate: true } },
      quotes: { where: { status: { in: ["DRAFT", "SENT", "FOLLOW_UP_NEEDED"] } }, select: { id: true }, take: 5 },
      tasks: { where: { status: "OPEN", dueDate: { lte: endOfToday }, ...repTaskFilter }, orderBy: { dueDate: "asc" }, select: { title: true }, take: 2 },
    },
    orderBy: [{ tier: "asc" }, { lastContactAt: "asc" }],
    take: 40,
  });

  const cards: FieldCard[] = customers.map(c => {
    const owed = c.invoices.reduce((s, i) => s + Number(i.balance), 0);
    const lastOrder = c.orders[0]?.orderDate ?? null;
    const daysSinceOrder = lastOrder ? Math.floor((now.getTime() - lastOrder.getTime()) / 86400000) : null;
    const daysSinceContact = c.lastContactAt ? Math.floor((now.getTime() - c.lastContactAt.getTime()) / 86400000) : null;
    const reason = c.tasks.length
      ? { kind: "task" as const, label: c.tasks[0].title.slice(0, 50) }
      : c.nextFollowUpAt && c.nextFollowUpAt <= endOfToday
        ? { kind: "followup" as const, label: "Follow-up due" }
        : { kind: "cold" as const, label: daysSinceContact === null ? "Never contacted" : `${daysSinceContact} days no contact` };
    const address = [c.address, c.city, c.state, c.zip].filter(Boolean).join(", ");
    return {
      id: c.id,
      name: c.companyName,
      contact: c.contactPerson,
      phone: c.contactCell || c.phone,
      address: address || null,
      city: c.city?.trim() || null,
      zip: c.zip?.trim().slice(0, 5) || null,
      tier: c.tier,
      owed,
      daysSinceOrder,
      openQuotes: c.quotes.length,
      reason,
    };
  });

  // tasks first, then due follow-ups, then coldest accounts
  const order: Record<FieldCard["reason"]["kind"], number> = { new: -2, added: -1, task: 0, followup: 1, cold: 2 };
  cards.sort((a, b) => order[a.reason.kind] - order[b.reason.kind]);

  return <FieldList cards={cards} />;
}
