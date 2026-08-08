import Link from "next/link";
import { startOfDay, startOfWeek, subDays } from "date-fns";
import { db } from "@/lib/db";
import { requireManager, locationScope, adminLocFilter } from "@/lib/auth";
import { StatCard, Card, Badge, Table, THead, EmptyRow } from "@/components/ui/primitives";
import {
  customerTemperature, temperatureLabels, temperatureClasses, quoteNeedsFollowUp,
  fmtDate, daysSince,
} from "@/lib/domain";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await requireManager();
  const loc = locationScope(session);
  const showAllLocations = session.role === "ADMIN" && !adminLocFilter();
  const locSummaries = showAllLocations
    ? await Promise.all((await db.location.findMany({ where: { active: true }, orderBy: { createdAt: "asc" } })).map(async L => {
        const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        const [customers, openLeads, pendingQuotes, wonAgg] = await Promise.all([
          db.customer.count({ where: { locationId: L.id, status: "ACTIVE" } }),
          db.lead.count({ where: { locationId: L.id, stage: { notIn: ["LOST", "ACTIVE_CUSTOMER"] } } }),
          db.quote.count({ where: { locationId: L.id, status: { in: ["SENT", "FOLLOW_UP_NEEDED"] } } }),
          db.quote.aggregate({ where: { locationId: L.id, status: "ACCEPTED", decidedAt: { gte: monthStart } }, _sum: { total: true } }),
        ]);
        return { loc: L, customers, openLeads, pendingQuotes, wonMtd: Number(wonAgg._sum.total ?? 0) };
      }))
    : [];
  const now = new Date();
  const today = startOfDay(now);
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });

  const CONSUMER_OPEN = ["SUBMITTED", "INSTALLER_NEEDED", "INSTALLER_CONTACTED", "INSTALLATION_REQUESTED", "INSTALLATION_SCHEDULED", "MANUAL_ASSISTANCE_REQUIRED"] as const;
  const [
    followUpsToday, overdueFollowUps, newLeadsThisWeek, activeCustomers, inactiveCustomers,
    quotesSentThisWeek, sentQuotes, callsToday, reps, attentionCustomers, overdueTasks, tasksToday,
    consumerOpen, consumerWeek,
  ] = await Promise.all([
    db.task.count({ where: { ...loc, status: "OPEN", dueDate: { gte: today, lt: new Date(today.getTime() + 86400000) } } }),
    db.task.count({ where: { ...loc, status: "OPEN", dueDate: { lt: today } } }),
    db.lead.count({ where: { ...loc, createdAt: { gte: weekStart } } }),
    db.customer.count({ where: { ...loc, status: "ACTIVE" } }),
    db.customer.count({ where: { ...loc, status: "INACTIVE" } }),
    db.quote.count({ where: { ...loc, sentAt: { gte: weekStart } } }),
    db.quote.findMany({
      where: { ...loc, status: { in: ["SENT", "FOLLOW_UP_NEEDED"] } },
      include: { customer: { select: { companyName: true } }, rep: { select: { name: true } } },
    }),
    db.activity.count({ where: { ...loc, occurredAt: { gte: today }, type: { in: ["CALL", "TEXT", "WHATSAPP", "EMAIL", "VISIT"] } } }),
    db.user.findMany({
      where: { role: "SALES_REP", active: true, ...(loc.locationId ? { locationId: loc.locationId } : {}) },
      select: {
        id: true, name: true,
        _count: { select: { customers: { where: { status: "ACTIVE" } } } },
        activities: { where: { occurredAt: { gte: today } }, select: { type: true, meaningful: true } },
        quotes: { where: { quoteDate: { gte: weekStart } }, select: { id: true } },
        tasksAssigned: { where: { status: "OPEN", dueDate: { lt: today } }, select: { id: true } },
      },
    }),
    // Customers needing attention: good tier but not contacted in 14+ days, or never
    db.customer.findMany({
      where: {
        status: { in: ["ACTIVE", "PROSPECT", "INACTIVE"] },
        OR: [{ lastContactAt: { lt: subDays(now, 14) } }, { lastContactAt: null }],
      },
      orderBy: [{ tier: "asc" }, { lastContactAt: "asc" }],
      take: 10,
      include: { assignedRep: { select: { name: true } } },
    }),
    db.task.findMany({
      where: { ...loc, status: "OPEN", dueDate: { lt: today } },
      orderBy: { dueDate: "asc" }, take: 8,
      include: { assignee: { select: { name: true } }, customer: { select: { companyName: true } } },
    }),
    db.task.findMany({
      where: { ...loc, status: "OPEN", dueDate: { gte: today, lt: new Date(today.getTime() + 86400000) } },
      orderBy: { dueDate: "asc" }, take: 8,
      include: { assignee: { select: { name: true } }, customer: { select: { companyName: true } } },
    }),
    // Website consumer requests (installation / send-to-installer funnel)
    db.consumerLead.count({ where: { ...loc, status: { in: [...CONSUMER_OPEN] } } }),
    db.consumerLead.count({ where: { ...loc, createdAt: { gte: weekStart } } }),
  ]);

  const quotesPendingFollowUp = sentQuotes.filter(q => quoteNeedsFollowUp(q, now));

  const repRanking = reps
    .map(r => ({
      id: r.id,
      name: r.name,
      calls: r.activities.filter(a => ["CALL", "NO_ANSWER", "VOICEMAIL"].includes(a.type)).length,
      meaningful: r.activities.filter(a => a.meaningful).length,
      quotes: r.quotes.length,
      overdue: r.tasksAssigned.length,
      activeCustomers: r._count.customers,
      score: 0,
    }))
    .map(r => ({ ...r, score: r.calls + r.meaningful * 2 + r.quotes * 3 - r.overdue }))
    .sort((a, b) => b.score - a.score);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Owner Dashboard</h1>
      {locSummaries.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {locSummaries.map(x => (
            <div key={x.loc.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-2 flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: x.loc.color }} />
                <span className="font-semibold text-slate-800">{x.loc.name}</span>
                <span className="text-xs text-slate-400">{x.loc.city}</span>
              </div>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div><div className="text-lg font-bold tabular-nums">{x.customers}</div><div className="text-[11px] text-slate-400">Customers</div></div>
                <div><div className="text-lg font-bold tabular-nums">{x.openLeads}</div><div className="text-[11px] text-slate-400">Open Leads</div></div>
                <div><div className="text-lg font-bold tabular-nums">{x.pendingQuotes}</div><div className="text-[11px] text-slate-400">Quotes Pending</div></div>
                <div><div className="text-lg font-bold text-emerald-600 tabular-nums">{"$" + x.wonMtd.toLocaleString()}</div><div className="text-[11px] text-slate-400">Won MTD</div></div>
              </div>
            </div>
          ))}
        </div>
      )}
        <div className="text-sm text-slate-500">{now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "America/New_York" })}</div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-8">
        <StatCard label="Follow-ups Today" value={followUpsToday} />
        <StatCard label="Overdue Follow-ups" value={overdueFollowUps} tone={overdueFollowUps > 0 ? "danger" : "good"} />
        <StatCard label="New Leads (Wk)" value={newLeadsThisWeek} />
        <StatCard label="Active Customers" value={activeCustomers} tone="good" />
        <StatCard label="Inactive Customers" value={inactiveCustomers} tone={inactiveCustomers > 0 ? "warn" : "default"} />
        <StatCard label="Quotes Sent (Wk)" value={quotesSentThisWeek} />
        <StatCard label="Quotes Need F/U" value={quotesPendingFollowUp.length} tone={quotesPendingFollowUp.length > 0 ? "warn" : "good"} />
        <StatCard label="Contacts Today" value={callsToday} />
        <Link href="/consumer-leads?status=open" className="contents">
          <StatCard label="Open Web Requests" value={consumerOpen} tone={consumerOpen > 0 ? "warn" : "good"} />
        </Link>
        <Link href="/consumer-leads" className="contents">
          <StatCard label="Consumer Leads (Wk)" value={consumerWeek} />
        </Link>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        {/* Rep ranking */}
        <Card title="Sales Rep Activity Ranking (Today)">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="pb-2">Rep</th><th className="pb-2">Calls</th><th className="pb-2">Meaningful</th>
                <th className="pb-2">Quotes (Wk)</th><th className="pb-2">Overdue</th><th className="pb-2">Active Cust.</th>
              </tr>
            </thead>
            <tbody>
              {repRanking.map((r, i) => (
                <tr key={r.id} className="border-b border-slate-50">
                  <td className="py-2 font-medium">{i + 1}. {r.name}</td>
                  <td className="py-2 tabular-nums">{r.calls}</td>
                  <td className="py-2 tabular-nums">{r.meaningful}</td>
                  <td className="py-2 tabular-nums">{r.quotes}</td>
                  <td className={`py-2 tabular-nums ${r.overdue > 0 ? "font-semibold text-red-600" : ""}`}>{r.overdue}</td>
                  <td className="py-2 tabular-nums">{r.activeCustomers}</td>
                </tr>
              ))}
              {repRanking.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-slate-400">No active sales reps yet.</td></tr>}
            </tbody>
          </table>
        </Card>

        {/* Quotes pending follow-up */}
        <Card title="Quotes Pending Follow-up" action={<Link href="/quotes" className="text-xs font-medium text-brand-600 hover:underline">View all →</Link>}>
          <div className="space-y-2">
            {quotesPendingFollowUp.slice(0, 6).map(q => (
              <div key={q.id} className="flex items-center justify-between rounded-md border border-amber-100 bg-amber-50 px-3 py-2 text-sm">
                <div>
                  <span className="font-medium">{q.quoteNumber}</span> · {q.customer.companyName}
                  <span className="ml-2 text-xs text-slate-500">{q.rep.name}</span>
                </div>
                <div className="text-xs text-amber-700">sent {fmtDate(q.sentAt)}</div>
              </div>
            ))}
            {quotesPendingFollowUp.length === 0 && <div className="py-6 text-center text-sm text-slate-400">Every sent quote has a recent follow-up. 👍</div>}
          </div>
        </Card>
      </div>

      {/* Customers that need attention */}
      <Card title="Customer Attention List — no recent contact" action={<Link href="/reports/customers" className="text-xs font-medium text-brand-600 hover:underline">Full report →</Link>}>
        <Table>
          <THead cols={["Customer", "Tier", "Rep", "Last Contact", "Days", "Temperature"]} />
          <tbody>
            {attentionCustomers.map(c => {
              const t = customerTemperature(c.lastContactAt, now);
              return (
                <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="px-3 py-2"><Link className="font-medium text-brand-700 hover:underline" href={`/customers/${c.id}`}>{c.companyName}</Link></td>
                  <td className="px-3 py-2"><Badge className="bg-slate-100 text-slate-700">Tier {c.tier}</Badge></td>
                  <td className="px-3 py-2 text-slate-600">{c.assignedRep?.name ?? <span className="text-red-600">Unassigned</span>}</td>
                  <td className="px-3 py-2">{fmtDate(c.lastContactAt)}</td>
                  <td className="px-3 py-2 tabular-nums">{daysSince(c.lastContactAt) ?? "—"}</td>
                  <td className="px-3 py-2"><Badge className={temperatureClasses[t]}>{temperatureLabels[t]}</Badge></td>
                </tr>
              );
            })}
            {attentionCustomers.length === 0 && <EmptyRow colSpan={6} message="All customers have recent contact." />}
          </tbody>
        </Table>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Overdue Tasks" action={<Link href="/tasks" className="text-xs font-medium text-brand-600 hover:underline">All tasks →</Link>}>
          <div className="space-y-2">
            {overdueTasks.map(t => (
              <div key={t.id} className="flex items-center justify-between rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm">
                <div><span className="font-medium">{t.title}</span>{t.customer && <span className="text-slate-500"> · {t.customer.companyName}</span>}</div>
                <div className="text-xs text-red-600">{t.assignee.name} · due {fmtDate(t.dueDate)}</div>
              </div>
            ))}
            {overdueTasks.length === 0 && <div className="py-6 text-center text-sm text-slate-400">No overdue tasks.</div>}
          </div>
        </Card>
        <Card title="Due Today">
          <div className="space-y-2">
            {tasksToday.map(t => (
              <div key={t.id} className="flex items-center justify-between rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-sm">
                <div><span className="font-medium">{t.title}</span>{t.customer && <span className="text-slate-500"> · {t.customer.companyName}</span>}</div>
                <div className="text-xs text-slate-500">{t.assignee.name}</div>
              </div>
            ))}
            {tasksToday.length === 0 && <div className="py-6 text-center text-sm text-slate-400">Nothing due today.</div>}
          </div>
        </Card>
      </div>

      <Card title="🤖 AI Sales Assistant" action={<Link href="/assistant" className="text-xs text-brand-600 hover:underline">Open assistant →</Link>}>
        <div className="grid gap-3 text-sm md:grid-cols-3">
          <Link href="/assistant" className="rounded-md border border-brand-200 bg-brand-50/50 p-3 text-slate-700 hover:bg-brand-50">
            📞 <span className="font-medium">Who to call today</span> — top follow-ups ranked with AI coaching tips
          </Link>
          <Link href="/assistant" className="rounded-md border border-brand-200 bg-brand-50/50 p-3 text-slate-700 hover:bg-brand-50">
            📝 <span className="font-medium">Draft follow-up messages</span> — email + text, ready to copy and send
          </Link>
          <Link href="/assistant" className="rounded-md border border-brand-200 bg-brand-50/50 p-3 text-slate-700 hover:bg-brand-50">
            💬 <span className="font-medium">Ask about your business</span> — English or 中文
          </Link>
        </div>
      </Card>
    </div>
  );
}
