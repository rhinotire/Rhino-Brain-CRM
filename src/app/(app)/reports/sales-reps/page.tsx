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

  const rows = await Promise.all(reps.map(async rep => {
    const period = { gte: start, lte: end };
    const [calls, meaningful, activities, quotesSent, quotesAccepted, acceptedValue, newLeads, converted, tasksDone, newCustomers] = await Promise.all([
      db.activity.count({ where: { repId: rep.id, occurredAt: period, type: { in: ["CALL", "NO_ANSWER", "VOICEMAIL"] } } }),
      db.activity.count({ where: { repId: rep.id, occurredAt: period, meaningful: true } }),
      db.activity.count({ where: { repId: rep.id, occurredAt: period } }),
      db.quote.count({ where: { repId: rep.id, sentAt: period } }),
      db.quote.count({ where: { repId: rep.id, decidedAt: period, status: "ACCEPTED" } }),
      db.quote.aggregate({ where: { repId: rep.id, decidedAt: period, status: "ACCEPTED" }, _sum: { total: true } }),
      db.lead.count({ where: { assignedRepId: rep.id, createdAt: period } }),
      db.lead.count({ where: { assignedRepId: rep.id, convertedAt: period } }),
      db.task.count({ where: { assigneeId: rep.id, completedAt: period } }),
      db.customer.count({ where: { assignedRepId: rep.id, createdAt: period } }),
    ]);
    const decided = await db.quote.count({ where: { repId: rep.id, decidedAt: period, status: { in: ["ACCEPTED", "REJECTED"] } } });
    const winRate = decided > 0 ? Math.round((quotesAccepted / decided) * 100) : null;
    return {
      rep, calls, meaningful, activities, quotesSent, quotesAccepted,
      acceptedValue: Number(acceptedValue._sum.total ?? 0),
      winRate, newLeads, converted, tasksDone, newCustomers,
    };
  }));

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
