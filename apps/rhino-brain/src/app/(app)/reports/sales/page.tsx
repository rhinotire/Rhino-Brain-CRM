import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireSession, isManager, isAccounting, locationScope } from "@/lib/auth";
import { Card, StatCard, Table, THead, EmptyRow } from "@/components/ui/primitives";
import { fmtMoney } from "@/lib/domain";

export const dynamic = "force-dynamic";

/**
 * Real Sales Performance (owner request 2026-10-28): the activity report shows
 * who CALLS; this shows who SELLS. Fed by the TireGuru "Salesperson Sales
 * Analysis" mirror (PosSale, synced every 2h) — real revenue + gross profit by
 * company and salesperson, with a daily trend and month-over-month deltas.
 * Note: PosSale is invoice-level by salesperson only — no customer / product
 * breakdown (those need additional TireGuru reports).
 */
const n = (v: unknown) => Number(v ?? 0);
const pct = (gp: number, sale: number) => (sale > 0 ? `${((gp / sale) * 100).toFixed(1)}%` : "—");
const monthLabel = (y: number, m: number) => new Date(Date.UTC(y, m, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

export default async function SalesPerformancePage({ searchParams }: { searchParams: { month?: string } }) {
  const session = await requireSession();
  if (!isManager(session) && !isAccounting(session)) redirect("/my-work");
  const scope = locationScope(session);

  const now = new Date();
  const mMatch = (searchParams.month ?? "").match(/^(\d{4})-(\d{2})$/);
  const y = mMatch ? Number(mMatch[1]) : now.getUTCFullYear();
  const m = mMatch ? Number(mMatch[2]) - 1 : now.getUTCMonth();
  const start = new Date(Date.UTC(y, m, 1));
  const end = new Date(Date.UTC(y, m + 1, 1));
  const prevStart = new Date(Date.UTC(y, m - 1, 1));
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const todayEnd = new Date(todayStart.getTime() + 86400000);
  const where = { date: { gte: start, lt: end }, ...scope };

  const [totals, prevTotals, today, bySalesperson, byLocation, byDay, earliest, locations] = await Promise.all([
    db.posSale.aggregate({ where, _sum: { sale: true, gp: true, qty: true }, _count: { _all: true } }),
    db.posSale.aggregate({ where: { date: { gte: prevStart, lt: start }, ...scope }, _sum: { sale: true, gp: true } }),
    db.posSale.aggregate({ where: { date: { gte: todayStart, lt: todayEnd }, ...scope }, _sum: { sale: true, gp: true } }),
    db.posSale.groupBy({ by: ["salesperson"], where, _sum: { sale: true, gp: true, qty: true }, _count: { _all: true } }),
    db.posSale.groupBy({ by: ["locationId"], where, _sum: { sale: true, gp: true, qty: true }, _count: { _all: true } }),
    db.posSale.groupBy({ by: ["date"], where, _sum: { sale: true }, orderBy: { date: "asc" } }),
    db.posSale.aggregate({ where: scope, _min: { date: true } }),
    db.location.findMany({ where: { active: true }, select: { id: true, name: true, shortTag: true, color: true } }),
  ]);

  const locName = new Map(locations.map(l => [l.id, l] as const));
  const sale = n(totals._sum.sale), gp = n(totals._sum.gp), prevSale = n(prevTotals._sum.sale), prevGp = n(prevTotals._sum.gp);
  const saleDelta = prevSale > 0 ? Math.round(((sale - prevSale) / prevSale) * 100) : null;
  const gpDelta = prevGp > 0 ? Math.round(((gp - prevGp) / prevGp) * 100) : null;
  const reps = bySalesperson.map(r => ({
    name: r.salesperson, sale: n(r._sum.sale), gp: n(r._sum.gp), qty: n(r._sum.qty), invoices: r._count._all,
  })).sort((a, b) => b.sale - a.sale);
  const companies = byLocation.map(l => ({
    tag: locName.get(l.locationId)?.shortTag ?? "?", name: locName.get(l.locationId)?.name ?? "Unknown",
    color: locName.get(l.locationId)?.color ?? "#64748b", sale: n(l._sum.sale), gp: n(l._sum.gp), qty: n(l._sum.qty), invoices: l._count._all,
  })).sort((a, b) => b.sale - a.sale);

  // month options from the earliest sale on record to the current month
  const months: { value: string; label: string }[] = [];
  const first = earliest._min.date ?? start;
  for (let d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)); d >= new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1)); d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1))) {
    months.push({ value: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`, label: monthLabel(d.getUTCFullYear(), d.getUTCMonth()) });
  }

  const maxDay = Math.max(1, ...byDay.map(d => n(d._sum.sale)));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">💵 Sales Performance <span className="text-sm font-normal text-slate-400">{monthLabel(y, m)}</span></h1>
          <p className="text-xs text-slate-500">Real revenue &amp; gross profit from TireGuru (synced every 2h). &quot;Salesperson, Default&quot; = TireLink / online channel.</p>
        </div>
        <form className="flex items-center gap-2">
          <select name="month" defaultValue={`${y}-${String(m + 1).padStart(2, "0")}`} className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm">
            {months.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <button type="submit" className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm hover:bg-slate-50">View</button>
        </form>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="Sales (month)" value={fmtMoney(sale)} hint={saleDelta !== null ? `${saleDelta >= 0 ? "▲" : "▼"} ${Math.abs(saleDelta)}% vs last mo.` : undefined} tone={saleDelta !== null && saleDelta < 0 ? "warn" : "good"} />
        <StatCard label="Gross Profit" value={fmtMoney(gp)} hint={gpDelta !== null ? `${gpDelta >= 0 ? "▲" : "▼"} ${Math.abs(gpDelta)}% vs last mo.` : undefined} tone={gpDelta !== null && gpDelta < 0 ? "warn" : "good"} />
        <StatCard label="GP Margin" value={pct(gp, sale)} />
        <StatCard label="Invoices" value={String(totals._count._all)} hint={`${n(totals._sum.qty)} units`} />
        <StatCard label="Sales Today" value={fmtMoney(n(today._sum.sale))} hint={`GP ${fmtMoney(n(today._sum.gp))}`} />
      </div>

      {companies.length > 1 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {companies.map(c => (
            <div key={c.tag} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 font-semibold text-slate-800">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.color }} />{c.name}
                </span>
                <span className="text-xs text-slate-400">{c.invoices} invoices · {c.qty} units</span>
              </div>
              <div className="mt-2 flex items-baseline gap-4">
                <span className="text-lg font-bold tabular-nums">{fmtMoney(c.sale)}</span>
                <span className="text-sm text-slate-500">GP {fmtMoney(c.gp)} · {pct(c.gp, c.sale)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {byDay.length > 0 && (
        <Card title="Daily sales this month">
          <div className="flex items-end gap-1 overflow-x-auto pb-1" style={{ height: 120 }}>
            {byDay.map(d => {
              const v = n(d._sum.sale);
              const day = new Date(d.date).getUTCDate();
              return (
                <div key={d.date.toISOString()} className="flex w-7 shrink-0 flex-col items-center justify-end gap-1" title={`${day}: ${fmtMoney(v)}`}>
                  <div className="w-full rounded-t bg-brand-500/80" style={{ height: `${Math.round((v / maxDay) * 90)}px` }} />
                  <span className="text-[10px] text-slate-400">{day}</span>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <Card title="By salesperson">
        <Table>
          <THead cols={["Salesperson", "Invoices", "Units", "Sales", "Gross Profit", "GP %"]} />
          <tbody>
            {reps.map(r => (
              <tr key={r.name} className="border-b border-slate-50 hover:bg-slate-50">
                <td className="px-3 py-2 font-medium text-slate-800">{r.name}</td>
                <td className="px-3 py-2 tabular-nums text-slate-600">{r.invoices}</td>
                <td className="px-3 py-2 tabular-nums text-slate-600">{r.qty}</td>
                <td className="px-3 py-2 font-semibold tabular-nums">{fmtMoney(r.sale)}</td>
                <td className="px-3 py-2 tabular-nums text-slate-700">{fmtMoney(r.gp)}</td>
                <td className="px-3 py-2 tabular-nums text-slate-500">{pct(r.gp, r.sale)}</td>
              </tr>
            ))}
            {reps.length === 0 && <EmptyRow colSpan={6} message="No sales recorded for this month yet — the TireGuru sync runs every 2h." />}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
