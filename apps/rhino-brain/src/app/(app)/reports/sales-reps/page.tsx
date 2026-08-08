import { db } from "@/lib/db";
import { requireManager, locationScope } from "@/lib/auth";
import { Table, THead, EmptyRow, Input, Select, Button, Card } from "@/components/ui/primitives";
import { fmtMoney, etDayStart } from "@/lib/domain";

export const dynamic = "force-dynamic";

type Search = { range?: string; from?: string; to?: string; rep?: string };

// Ranges are computed on Eastern-time day boundaries (Orlando HQ), not server UTC.
function rangeToDates(range: string | undefined, from?: string, to?: string): { start: Date; end: Date; label: string } {
  const now = new Date();
  const end = now;
  if (range === "custom" && from) {
    // interpret the picked calendar dates as ET days
    const start = etDayStart(new Date(from + "T12:00:00Z"));
    const endCustom = to ? new Date(etDayStart(new Date(to + "T12:00:00Z")).getTime() + 86400000 - 1) : end;
    return { start, end: endCustom, label: `${from} → ${to ?? "today"}` };
  }
  if (range === "week") return { start: etDayStart(now, { toWeekStart: true }), end, label: "This Week" };
  if (range === "month") return { start: etDayStart(now, { toMonthStart: true }), end, label: "This Month" };
  return { start: etDayStart(now), end, label: "Today" };
}

export default async function SalesRepReport({ searchParams }: { searchParams: Search }) {
  const session = await requireManager();
  const locWhere = locationScope(session);
  const { start, end, label } = rangeToDates(searchParams.range, searchParams.from, searchParams.to);

  const reps = await db.user.findMany({
    where: { active: true, role: { in: ["SALES_REP", "MANAGER"] }, ...locWhere, ...(searchParams.rep ? { id: searchParams.rep } : {}) },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const allReps = await db.user.findMany({ where: { active: true, role: { in: ["SALES_REP", "MANAGER"] }, ...locWhere }, select: { id: true, name: true }, orderBy: { name: "asc" } });

  // One groupBy per metric (10 queries total, independent of rep count) instead of ~12 per rep.
  const period = { gte: start, lte: end };
  const inReps = { in: reps.map(r => r.id) };
  const [actAll, actCalls, actMean, qSent, qAcc, qDecided, lNew, lConv, tDone, cNew] = await Promise.all([
    db.activity.groupBy({ by: ["repId"], where: { repId: inReps, occurredAt: period }, _count: { _all: true } }),
    db.activity.groupBy({ by: ["repId"], where: { repId: inReps, occurredAt: period, type: { in: ["CALL", "NO_ANSWER", "VOICEMAIL"] } }, _count: { _all: true } }),
    db.activity.groupBy({ by: ["repId"], where: { repId: inReps, occurredAt: period, meaningful: true }, _count: { _all: true } }),
    db.quote.groupBy({ by: ["repId"], where: { repId: inReps, sentAt: period }, _count: { _all: true } }),
    db.quote.groupBy({ by: ["repId"], where: { repId: inReps, decidedAt: period, status: "ACCEPTED" }, _count: { _all: true }, _sum: { total: true } }),
    db.quote.groupBy({ by: ["repId"], where: { repId: inReps, decidedAt: period, status: { in: ["ACCEPTED", "REJECTED"] } }, _count: { _all: true } }),
    db.lead.groupBy({ by: ["assignedRepId"], where: { assignedRepId: inReps, createdAt: period }, _count: { _all: true } }),
    db.lead.groupBy({ by: ["assignedRepId"], where: { assignedRepId: inReps, convertedAt: period }, _count: { _all: true } }),
    db.task.groupBy({ by: ["assigneeId"], where: { assigneeId: inReps, completedAt: period }, _count: { _all: true } }),
    db.customer.groupBy({ by: ["assignedRepId"], where: { assignedRepId: inReps, createdAt: period }, _count: { _all: true } }),
  ]);
  const cntMap = (arr: { _count: { _all: number } }[], key: string) => {
    const m = new Map<string, number>();
    for (const r of arr) { const id = (r as Record<string, unknown>)[key] as string | null; if (id) m.set(id, r._count._all); }
    return m;
  };
  const mActAll = cntMap(actAll, "repId"), mCalls = cntMap(actCalls, "repId"), mMean = cntMap(actMean, "repId");
  const mSent = cntMap(qSent, "repId"), mAcc = cntMap(qAcc, "repId"), mDecided = cntMap(qDecided, "repId");
  const mNew = cntMap(lNew, "assignedRepId"), mConv = cntMap(lConv, "assignedRepId"), mTasks = cntMap(tDone, "assigneeId"), mCust = cntMap(cNew, "assignedRepId");
  const mAccVal = new Map<string, number>();
  for (const r of qAcc) { if (r.repId) mAccVal.set(r.repId, Number(r._sum.total ?? 0)); }

  const rows = reps.map(rep => {
    const quotesAccepted = mAcc.get(rep.id) ?? 0;
    const decided = mDecided.get(rep.id) ?? 0;
    return {
      rep,
      calls: mCalls.get(rep.id) ?? 0,
      meaningful: mMean.get(rep.id) ?? 0,
      activities: mActAll.get(rep.id) ?? 0,
      quotesSent: mSent.get(rep.id) ?? 0,
      quotesAccepted,
      acceptedValue: mAccVal.get(rep.id) ?? 0,
      winRate: decided > 0 ? Math.round((quotesAccepted / decided) * 100) : null,
      newLeads: mNew.get(rep.id) ?? 0,
      converted: mConv.get(rep.id) ?? 0,
      tasksDone: mTasks.get(rep.id) ?? 0,
      newCustomers: mCust.get(rep.id) ?? 0,
    };
  });

  const totals = rows.reduce((t, r) => ({
    calls: t.calls + r.calls, meaningful: t.meaningful + r.meaningful, activities: t.activities + r.activities,
    quotesSent: t.quotesSent + r.quotesSent, quotesAccepted: t.quotesAccepted + r.quotesAccepted,
    acceptedValue: t.acceptedValue + r.acceptedValue, converted: t.converted + r.converted,
  }), { calls: 0, meaningful: 0, activities: 0, quotesSent: 0, quotesAccepted: 0, acceptedValue: 0, converted: 0 });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Sales Rep Performance <span className="text-sm font-normal text-slate-400">— {label}</span></h1>

      <form className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-white p-3">
        <Select name="range" defaultValue={searchParams.range ?? "today"} className="w-36">
          <option value="today">Today</option>
          <option value="week">This Week</option>
          <option value="month">This Month</option>
          <option value="custom">Custom</option>
        </Select>
        <Input name="from" type="date" defaultValue={searchParams.from} className="w-40" />
        <Input name="to" type="date" defaultValue={searchParams.to} className="w-40" />
        <Select name="rep" defaultValue={searchParams.rep ?? ""} className="w-44">
          <option value="">All reps</option>
          {allReps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </Select>
        <Button type="submit" variant="secondary">Run report</Button>
      </form>

      <Card>
        <Table>
          <THead cols={["Rep", "Calls", "Meaningful Conv.", "All Activities", "Quotes Sent", "Quotes Won", "Win Rate", "Won Value", "New Leads", "Leads Converted", "Tasks Done", "New Customers"]} />
          <tbody>
            {rows.map(r => (
              <tr key={r.rep.id} className="border-b border-slate-50 hover:bg-slate-50">
                <td className="px-3 py-2 font-medium text-slate-800">{r.rep.name}</td>
                <td className="px-3 py-2 tabular-nums">{r.calls}</td>
                <td className="px-3 py-2 tabular-nums">{r.meaningful}</td>
                <td className="px-3 py-2 tabular-nums">{r.activities}</td>
                <td className="px-3 py-2 tabular-nums">{r.quotesSent}</td>
                <td className="px-3 py-2 tabular-nums">{r.quotesAccepted}</td>
                <td className="px-3 py-2 tabular-nums">{r.winRate === null ? "—" : `${r.winRate}%`}</td>
                <td className="px-3 py-2 font-semibold tabular-nums">{fmtMoney(r.acceptedValue)}</td>
                <td className="px-3 py-2 tabular-nums">{r.newLeads}</td>
                <td className="px-3 py-2 tabular-nums">{r.converted}</td>
                <td className="px-3 py-2 tabular-nums">{r.tasksDone}</td>
                <td className="px-3 py-2 tabular-nums">{r.newCustomers}</td>
              </tr>
            ))}
            {rows.length > 1 && (
              <tr className="bg-slate-50 font-semibold">
                <td className="px-3 py-2">Team Total</td>
                <td className="px-3 py-2 tabular-nums">{totals.calls}</td>
                <td className="px-3 py-2 tabular-nums">{totals.meaningful}</td>
                <td className="px-3 py-2 tabular-nums">{totals.activities}</td>
                <td className="px-3 py-2 tabular-nums">{totals.quotesSent}</td>
                <td className="px-3 py-2 tabular-nums">{totals.quotesAccepted}</td>
                <td className="px-3 py-2">—</td>
                <td className="px-3 py-2 tabular-nums">{fmtMoney(totals.acceptedValue)}</td>
                <td className="px-3 py-2">—</td>
                <td className="px-3 py-2 tabular-nums">{totals.converted}</td>
                <td className="px-3 py-2">—</td>
                <td className="px-3 py-2">—</td>
              </tr>
            )}
            {rows.length === 0 && <EmptyRow colSpan={12} message="No reps found." />}
          </tbody>
        </Table>
      </Card>
      <p className="text-xs text-slate-400">Calls include No Answer and Voicemail attempts. Win rate = accepted ÷ (accepted + rejected) decided in the period.</p>
    </div>
  );
}
