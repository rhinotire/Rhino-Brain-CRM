import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { Card, StatCard, Badge, EmptyState } from "@/components/ui/primitives";
import { QuickLogButton } from "@/components/quick-log";
import { NewTaskButton, TaskActions } from "@/components/task-form";
import { NewQuoteButton } from "@/components/quote-form";
import {
  stageLabels, quoteNeedsFollowUp, quoteStatusLabels, taskPriorityLabels,
  fmtDate, fmtMoney, daysSince, temperatureClasses, temperatureLabels, customerTemperature,
} from "@/lib/domain";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function MyWorkPage() {
  const session = await requireSession();
  const now = new Date();
  const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(now); dayEnd.setHours(23, 59, 59, 999);
  const me = session.userId;

  const [
    callsToday, meaningfulToday, quotesSentToday,
    overdueFollowUps, followUpsToday, newLeads, quotesRaw, myTasks, reactivation, myCustomers,
  ] = await Promise.all([
    db.activity.count({ where: { repId: me, occurredAt: { gte: dayStart, lte: dayEnd }, type: { in: ["CALL", "NO_ANSWER", "VOICEMAIL"] } } }),
    db.activity.count({ where: { repId: me, occurredAt: { gte: dayStart, lte: dayEnd }, meaningful: true } }),
    db.quote.count({ where: { repId: me, sentAt: { gte: dayStart, lte: dayEnd } } }),
    db.customer.findMany({
      where: { assignedRepId: me, status: "ACTIVE", nextFollowUpAt: { lt: dayStart } },
      orderBy: { nextFollowUpAt: "asc" }, take: 20,
    }),
    db.customer.findMany({
      where: { assignedRepId: me, status: "ACTIVE", nextFollowUpAt: { gte: dayStart, lte: dayEnd } },
      orderBy: { nextFollowUpAt: "asc" }, take: 20,
    }),
    db.lead.findMany({
      where: { assignedRepId: me, stage: { in: ["NEW_LEAD", "CONTACTED"] } },
      orderBy: { createdAt: "desc" }, take: 15,
    }),
    db.quote.findMany({
      where: { repId: me, status: { in: ["SENT", "FOLLOW_UP_NEEDED"] } },
      include: { customer: { select: { id: true, companyName: true } } },
      orderBy: { sentAt: "asc" }, take: 30,
    }),
    db.task.findMany({
      where: { assigneeId: me, status: "OPEN" },
      include: { customer: { select: { id: true, companyName: true } }, creator: { select: { name: true } } },
      orderBy: [{ dueDate: "asc" }], take: 20,
    }),
    db.customer.findMany({
      where: {
        assignedRepId: me, status: "ACTIVE",
        OR: [{ lastContactAt: null }, { lastContactAt: { lt: new Date(now.getTime() - 30 * 86400000) } }],
      },
      orderBy: { lastContactAt: "asc" }, take: 10,
    }),
    db.customer.findMany({ where: { assignedRepId: me }, select: { id: true, companyName: true }, orderBy: { companyName: "asc" }, take: 500 }),
  ]);

  const quotesToFollowUp = quotesRaw.filter(q => q.status === "FOLLOW_UP_NEEDED" || quoteNeedsFollowUp(q, now));
  const overdueTasks = myTasks.filter(t => t.dueDate && t.dueDate < dayStart);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">My Work Today</h1>
          <p className="text-sm text-slate-500">{now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })} — {session.name}</p>
        </div>
        <div className="flex gap-2">
          <QuickLogButton customers={myCustomers} label="Log Call" />
          <NewQuoteButton customers={myCustomers} />
          <NewTaskButton customers={myCustomers} users={[{ id: me, name: session.name }]} canAssign={false} selfId={me} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Calls Today" value={String(callsToday)} />
        <StatCard label="Meaningful Conversations" value={String(meaningfulToday)} tone={meaningfulToday > 0 ? "good" : "default"} />
        <StatCard label="Quotes Sent Today" value={String(quotesSentToday)} />
        <StatCard label="Overdue Follow-ups" value={String(overdueFollowUps.length)} tone={overdueFollowUps.length > 0 ? "danger" : "good"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={`Overdue Follow-ups (${overdueFollowUps.length})`}>
          {overdueFollowUps.length === 0 ? <EmptyState message="Nothing overdue — nice." /> : (
            <ul className="divide-y divide-slate-50">
              {overdueFollowUps.map(c => (
                <li key={c.id} className="flex items-center justify-between gap-2 py-2">
                  <div>
                    <Link href={`/customers/${c.id}`} className="font-medium text-brand-700 hover:underline">{c.companyName}</Link>
                    <div className="text-xs text-red-600">Due {fmtDate(c.nextFollowUpAt)} · {daysSince(c.nextFollowUpAt, now)}d overdue</div>
                  </div>
                  <QuickLogButton customerId={c.id} label="Log Call" variant="secondary" size="sm" />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={`Follow-ups Due Today (${followUpsToday.length})`}>
          {followUpsToday.length === 0 ? <EmptyState message="No follow-ups scheduled for today." /> : (
            <ul className="divide-y divide-slate-50">
              {followUpsToday.map(c => (
                <li key={c.id} className="flex items-center justify-between gap-2 py-2">
                  <div>
                    <Link href={`/customers/${c.id}`} className="font-medium text-brand-700 hover:underline">{c.companyName}</Link>
                    <div className="text-xs text-slate-500">{c.contactPerson || ""} {c.phone ? `· ${c.phone}` : ""}</div>
                  </div>
                  <QuickLogButton customerId={c.id} label="Log Call" variant="secondary" size="sm" />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={`New Leads to Work (${newLeads.length})`} action={<Link href="/pipeline" className="text-xs text-brand-700 hover:underline">Open pipeline →</Link>}>
          {newLeads.length === 0 ? <EmptyState message="No new leads assigned to you." /> : (
            <ul className="divide-y divide-slate-50">
              {newLeads.map(l => (
                <li key={l.id} className="flex items-center justify-between gap-2 py-2">
                  <div>
                    <span className="font-medium text-slate-800">{l.companyName}</span>
                    <span className="ml-2 text-xs text-slate-400">{stageLabels[l.stage]} · added {fmtDate(l.createdAt)}</span>
                    {l.phone && <div className="text-xs text-slate-500">{l.phone}</div>}
                  </div>
                  <QuickLogButton leadId={l.id} label="Log Call" variant="secondary" size="sm" />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={`Quotes Needing Follow-up (${quotesToFollowUp.length})`} action={<Link href="/quotes" className="text-xs text-brand-700 hover:underline">All quotes →</Link>}>
          {quotesToFollowUp.length === 0 ? <EmptyState message="All sent quotes are being followed up." /> : (
            <ul className="divide-y divide-slate-50">
              {quotesToFollowUp.map(q => (
                <li key={q.id} className="flex items-center justify-between gap-2 py-2">
                  <div>
                    <span className="font-medium text-slate-800">{q.quoteNumber}</span>
                    <span className="ml-2 text-sm text-slate-600">{q.customer.companyName}</span>
                    <div className="text-xs text-amber-700">
                      {fmtMoney(Number(q.total))} · sent {fmtDate(q.sentAt)} · {quoteStatusLabels["FOLLOW_UP_NEEDED"]}
                    </div>
                  </div>
                  <QuickLogButton customerId={q.customer.id} quoteId={q.id} label="Log Follow-up" variant="secondary" size="sm" />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={`My Tasks (${myTasks.length})`} action={<Link href="/tasks" className="text-xs text-brand-700 hover:underline">All tasks →</Link>}>
          {myTasks.length === 0 ? <EmptyState message="No open tasks." /> : (
            <ul className="divide-y divide-slate-50">
              {myTasks.slice(0, 10).map(t => (
                <li key={t.id} className="flex items-center justify-between gap-2 py-2">
                  <div>
                    <span className="font-medium text-slate-800">{t.title}</span>
                    <Badge className={`ml-2 ${t.priority === "HIGH" ? "bg-red-100 text-red-700" : t.priority === "MEDIUM" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"}`}>
                      {taskPriorityLabels[t.priority]}
                    </Badge>
                    <div className="text-xs text-slate-500">
                      {t.customer && <Link href={`/customers/${t.customer.id}`} className="text-brand-700 hover:underline">{t.customer.companyName}</Link>}
                      {t.dueDate && <span className={t.dueDate < dayStart ? "ml-1 font-semibold text-red-600" : "ml-1"}>due {fmtDate(t.dueDate)}{t.dueDate < dayStart ? " · overdue" : ""}</span>}
                      <span className="ml-1 text-slate-400">from {t.creator.name}</span>
                    </div>
                  </div>
                  <TaskActions taskId={t.id} status={t.status} />
                </li>
              ))}
            </ul>
          )}
          {overdueTasks.length > 0 && <p className="mt-2 text-xs font-medium text-red-600">{overdueTasks.length} task(s) overdue</p>}
        </Card>

        <Card title={`Reactivation List — 30+ days no contact (${reactivation.length})`}>
          {reactivation.length === 0 ? <EmptyState message="No customers going cold. Keep it up." /> : (
            <ul className="divide-y divide-slate-50">
              {reactivation.map(c => {
                const temp = customerTemperature(c.lastContactAt, now);
                return (
                  <li key={c.id} className="flex items-center justify-between gap-2 py-2">
                    <div>
                      <Link href={`/customers/${c.id}`} className="font-medium text-brand-700 hover:underline">{c.companyName}</Link>
                      <Badge className={`ml-2 ${temperatureClasses[temp]}`}>{temperatureLabels[temp]}</Badge>
                      <div className="text-xs text-slate-500">Last contact: {fmtDate(c.lastContactAt) || "never"} ({daysSince(c.lastContactAt, now) ?? "∞"}d)</div>
                    </div>
                    <QuickLogButton customerId={c.id} label="Reactivate" variant="secondary" size="sm" />
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
