import { db } from "@/lib/db";
import { requireSession, isManager, repScope, locationScope } from "@/lib/auth";
import { Table, THead, EmptyRow, Badge, Select, Input, Button, Card } from "@/components/ui/primitives";
import { QuickLogButton } from "@/components/quick-log";
import { activityTypeLabels, fmtDateTime, fmtDate, daysSince, temperatureClasses, temperatureLabels, customerTemperature } from "@/lib/domain";
import Link from "next/link";
import type { Prisma, ActivityType } from "@prisma/client";

export const dynamic = "force-dynamic";

type Search = { type?: string; rep?: string; from?: string; to?: string; untouched?: string };

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Activity Log</h1>
        <div className="flex gap-2">
          <a href="/api/export/activities" className="inline-flex h-9 items-center rounded-md border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-700 hover:bg-slate-50">Export CSV</a>
          <QuickLogButton customers={customers} label="+ Log Activity" />
        </div>
      </div>

      <form className="flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-white p-3">
        <Select name="type" defaultValue={searchParams.type ?? ""} className="w-48">
          <option value="">All activity types</option>
          {Object.entries(activityTypeLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
        {manager && (
          <Select name="rep" defaultValue={searchParams.rep ?? ""} className="w-40">
            <option value="">All reps</option>
            {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
        )}
        <Input name="from" type="date" defaultValue={searchParams.from} className="w-40" />
        <Input name="to" type="date" defaultValue={searchParams.to} className="w-40" />
        <Select name="untouched" defaultValue={searchParams.untouched ?? ""} className="w-56">
          <option value="">Untouched customers: off</option>
          {[7, 14, 30, 60, 90].map(d => <option key={d} value={d}>No contact in {d}+ days</option>)}
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
        <THead cols={["When", "Type", "Account", "Rep", "Notes", "Meaningful"]} />
        <tbody>
          {activities.map(a => (
            <tr key={a.id} className="border-b border-slate-50 hover:bg-slate-50">
              <td className="whitespace-nowrap px-3 py-2">{fmtDateTime(a.occurredAt)}</td>
              <td className="px-3 py-2"><Badge className="bg-slate-100 text-slate-600">{activityTypeLabels[a.type]}</Badge></td>
              <td className="px-3 py-2">
                {a.customer && <Link href={`/customers/${a.customer.id}`} className="text-brand-700 hover:underline">{a.customer.companyName}</Link>}
                {a.lead && <span className="text-slate-600">{a.lead.companyName} <span className="text-xs text-slate-400">(lead)</span></span>}
                {!a.customer && !a.lead && "—"}
              </td>
              <td className="px-3 py-2 text-slate-600">{a.rep.name}</td>
              <td className="max-w-md px-3 py-2 text-slate-600">{a.notes || "—"}</td>
              <td className="px-3 py-2">{a.meaningful ? <Badge className="bg-emerald-100 text-emerald-800">Yes</Badge> : <span className="text-slate-300">—</span>}</td>
            </tr>
          ))}
          {activities.length === 0 && <EmptyRow colSpan={6} message="No activities logged for this filter." />}
        </tbody>
      </Table>
    </div>
  );
}
