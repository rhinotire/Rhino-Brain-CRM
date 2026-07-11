import { db } from "@/lib/db";
import { requireSession, isManager, repScope, locationScope } from "@/lib/auth";
import { Table, THead, EmptyRow, Badge, Select, Input, Button, Card, StatCard } from "@/components/ui/primitives";
import { QuickLogButton } from "@/components/quick-log";
import { activityTypeLabels, fmtDateTime, fmtDate, daysSince, temperatureClasses, temperatureLabels, customerTemperature, etDayStart } from "@/lib/domain";
import Link from "next/link";
import type { Prisma, ActivityType } from "@prisma/client";

export const dynamic = "force-dynamic";

type Search = { type?: string; rep?: string; from?: string; to?: string; untouched?: string };

// Classify an activity into an outcome so the list is scannable at a glance.
type Outcome = { key: "won" | "lost" | "noanswer" | "quote" | "normal"; label: string; cls: string };
function classify(a: { type: ActivityType; outcome: string | null; notes: string | null }): Outcome {
  const text = `${a.outcome ?? ""} ${a.notes ?? ""}`.toLowerCase();
  if (a.outcome?.toLowerCase().startsWith("positive") || /\b(made an order|did an order|placed an order|ordered|will order|order online)\b/.test(text))
    return { key: "won", label: "Order", cls: "bg-emerald-100 text-emerald-800" };
  if (a.outcome?.toLowerCase().startsWith("lost") || /\b(no stock|did not have|not in stock|out of stock|no need|lost sale|bought elsewhere)\b/.test(text))
    return { key: "lost", label: "Lost", cls: "bg-red-100 text-red-700" };
  if (a.type === "NO_ANSWER" || a.type === "VOICEMAIL" || /\b(no answer|nobody answer|no one answer|voicemail|not replying|didn'?t answer|left a message|left a voicemail)\b/.test(text))
    return { key: "noanswer", label: "No answer", cls: "bg-slate-100 text-slate-500" };
  if (a.type === "QUOTE" || /\bquot(e|ed|ing)\b/.test(text))
    return { key: "quote", label: "Quote", cls: "bg-sky-100 text-sky-700" };
  return { key: "normal", label: activityTypeLabels[a.type], cls: "bg-slate-100 text-slate-600" };
}

export default async function ActivitiesPage({ searchParams }: { searchParams: Search }) {
  const session = await requireSession();
  const manager = isManager(session);
  const now = new Date();

  const where: Prisma.ActivityWhereInput = { ...repScope(session, "repId"), ...locationScope(session) };
  if (searchParams.type) where.type = searchParams.type as ActivityType;
  if (manager && searchParams.rep) where.repId = searchParams.rep;
  if (searchParams.from) where.occurredAt = { gte: new Date(searchParams.from) };
  if (searchParams.to) where.occurredAt = { ...(where.occurredAt as object), lte: new Date(searchParams.to + "T23:59:59") };

  const untouchedDays = Number(searchParams.untouched ?? 0) || 0;
  const untouchedCutoff = new Date(now.getTime() - untouchedDays * 86400000);
  const filteredToOneRep = !!(manager && searchParams.rep);

  const [activities, customers, reps, untouched] = await Promise.all([
    db.activity.findMany({
      where, orderBy: { occurredAt: "desc" }, take: 200,
      include: {
        rep: { select: { name: true } },
        customer: { select: { id: true, companyName: true } },
        lead: { select: { id: true, companyName: true } },
      },
    }),
    db.customer.findMany({ where: { ...repScope(session), ...locationScope(session) }, select: { id: true, companyName: true }, orderBy: { companyName: "asc" }, take: 500 }),
    manager ? db.user.findMany({ where: { active: true }, select: { id: true, name: true } }) : Promise.resolve([]),
    untouchedDays > 0
      ? db.customer.findMany({
          where: {
            ...repScope(session, "assignedRepId"),
            ...locationScope(session),
            status: "ACTIVE",
            OR: [{ lastContactAt: null }, { lastContactAt: { lt: untouchedCutoff } }],
          },
          include: { assignedRep: { select: { name: true } } },
          orderBy: { lastContactAt: "asc" },
          take: 100,
        })
      : Promise.resolve([]),
  ]);

  const rows = activities.map(a => ({ a, o: classify(a) }));
  const todayStart = etDayStart(now);
  const todayRows = rows.filter(x => x.a.occurredAt >= todayStart);
  const count = (k: Outcome["key"], set = todayRows) => set.filter(x => x.o.key === k).length;
  const stat = {
    calls: todayRows.length,
    won: count("won"),
    lost: count("lost"),
    noanswer: count("noanswer"),
    meaningful: todayRows.filter(x => x.a.meaningful).length,
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Activity Log</h1>
        <div className="flex gap-2">
          {manager && <a href="/api/export/activities" className="inline-flex h-9 items-center rounded-md border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-700 hover:bg-slate-50">Export CSV</a>}
          <QuickLogButton customers={customers} label="+ Log Activity" />
        </div>
      </div>

      {/* Today at a glance */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="Logged today" value={stat.calls} />
        <StatCard label="Orders today" value={stat.won} tone="good" />
        <StatCard label="Lost today" value={stat.lost} tone={stat.lost > 0 ? "danger" : "default"} />
        <StatCard label="No answer" value={stat.noanswer} />
        <StatCard label="Meaningful convos" value={stat.meaningful} />
      </div>

      <form className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-white p-3">
        <Select name="type" defaultValue={searchParams.type ?? ""} className="w-40">
          <option value="">All types</option>
          {Object.entries(activityTypeLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
        {manager && (
          <Select name="rep" defaultValue={searchParams.rep ?? ""} className="w-40">
            <option value="">All reps</option>
            {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
        )}
        <Input name="from" type="date" defaultValue={searchParams.from} className="w-36" />
        <Input name="to" type="date" defaultValue={searchParams.to} className="w-36" />
        <Select name="untouched" defaultValue={searchParams.untouched ?? ""} className="w-48">
          <option value="">Untouched: off</option>
          {[7, 14, 30, 60, 90].map(d => <option key={d} value={d}>No contact {d}+ days</option>)}
        </Select>
        <Button type="submit" variant="secondary">Apply</Button>
      </form>

      {untouchedDays > 0 && (
        <Card title={`Customers with no contact in ${untouchedDays}+ days (${untouched.length})`}>
          <Table>
            <THead cols={["Customer", "Rep", "Last Contact", "Days", "Temperature", "Action"]} />
            <tbody>
              {untouched.map(c => {
                const temp = customerTemperature(c.lastContactAt, now);
                return (
                  <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="px-3 py-2"><Link href={`/customers/${c.id}`} className="font-medium text-brand-700 hover:underline">{c.companyName}</Link></td>
                    <td className="px-3 py-2 text-slate-600">{c.assignedRep?.name ?? "—"}</td>
                    <td className="px-3 py-2">{fmtDate(c.lastContactAt)}</td>
                    <td className="px-3 py-2 font-semibold text-red-600">{daysSince(c.lastContactAt, now) ?? "Never"}</td>
                    <td className="px-3 py-2"><Badge className={temperatureClasses[temp]}>{temperatureLabels[temp]}</Badge></td>
                    <td className="px-3 py-2"><QuickLogButton customerId={c.id} label="Log Call" variant="secondary" size="sm" /></td>
                  </tr>
                );
              })}
              {untouched.length === 0 && <EmptyRow colSpan={6} message="Great — every customer has been contacted within this window." />}
            </tbody>
          </Table>
        </Card>
      )}

      <Table>
        <THead cols={["When", "Outcome", "Account", ...(filteredToOneRep ? [] : ["Rep"]), "Notes", ""]} />
        <tbody>
          {rows.map(({ a, o }) => (
            <tr key={a.id} className="border-b border-slate-50 hover:bg-slate-50">
              <td className="whitespace-nowrap px-3 py-2 text-slate-600">{fmtDateTime(a.occurredAt)}</td>
              <td className="px-3 py-2 whitespace-nowrap">
                <Badge className={o.cls}>{o.label}</Badge>
                {a.type !== "CALL" && o.key !== "noanswer" && o.label !== activityTypeLabels[a.type] && (
                  <span className="ml-1 text-xs text-slate-400">{activityTypeLabels[a.type]}</span>
                )}
              </td>
              <td className="px-3 py-2">
                {a.customer && <Link href={`/customers/${a.customer.id}`} className="font-medium text-brand-700 hover:underline">{a.customer.companyName}</Link>}
                {a.lead && <span className="text-slate-600">{a.lead.companyName} <span className="text-xs text-slate-400">(lead)</span></span>}
                {!a.customer && !a.lead && "—"}
              </td>
              {!filteredToOneRep && <td className="px-3 py-2 whitespace-nowrap text-slate-600">{a.rep.name}</td>}
              <td className="px-3 py-2 text-slate-700">
                {a.notes || <span className="text-slate-300">—</span>}
                {a.meaningful && <span className="ml-1.5 align-middle text-emerald-500" title="Meaningful conversation">●</span>}
              </td>
              <td className="px-3 py-2 text-right whitespace-nowrap">
                {a.customer && <QuickLogButton customerId={a.customer.id} label="Log again" variant="ghost" size="sm" />}
              </td>
            </tr>
          ))}
          {rows.length === 0 && <EmptyRow colSpan={filteredToOneRep ? 5 : 6} message="No activities logged for this filter." />}
        </tbody>
      </Table>
      {rows.length === 200 && <p className="text-xs text-slate-400">Showing the 200 most recent — narrow the date range to see older activity.</p>}
    </div>
  );
}
