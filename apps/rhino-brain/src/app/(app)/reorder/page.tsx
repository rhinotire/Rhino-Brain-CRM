import Link from "next/link";
import { db } from "@/lib/db";
import { requireSession, isManager } from "@/lib/auth";
import { companyFor } from "@/actions/competitor-lookup";
import { Card, StatCard, Table, THead, EmptyRow, Badge } from "@/components/ui/primitives";
import { QuickLogButton } from "@/components/quick-log";
import { fmtMoney, daysSince } from "@/lib/domain";

export const dynamic = "force-dynamic";

/**
 * Reorder / churn-risk alerts (owner request 2026-10-28): a regular customer
 * who has gone quiet past their normal buying rhythm — the rep should call
 * before they buy elsewhere. Built from CustomerReorder (TireGuru Customer
 * Transaction File, synced 2h). A customer is "quiet" when they have a reliable
 * cadence (≥3 buy-days) and days-since-last exceeds 2× their average interval
 * (and ≥21 days absolute). Written-off / inactive customers are excluded.
 */
const QUIET_FACTOR = 2;
const MIN_QUIET_DAYS = 21;

export default async function ReorderPage() {
  const session = await requireSession();
  const company = await companyFor(session);
  const manager = isManager(session);
  const now = new Date();

  const rows = await db.customerReorder.findMany({
    where: { company, purchaseCount: { gte: 3 }, avgIntervalDays: { not: null } },
    orderBy: { lastPurchaseAt: "asc" },
  });
  const custIds = rows.map(r => r.customerId).filter((x): x is string => !!x);
  const customers = custIds.length
    ? await db.customer.findMany({
        where: { id: { in: custIds } },
        select: { id: true, companyName: true, phone: true, status: true, arWriteOffAt: true, assignedRepId: true, assignedRep: { select: { name: true } } },
      })
    : [];
  const cmap = new Map(customers.map(c => [c.id, c]));

  type Alert = {
    id: string; name: string; customerId: string | null; rep: string | null; phone: string | null;
    daysAgo: number; avg: number; buyDays: number; sales: number; ratio: number; score: number;
  };
  const alerts: Alert[] = [];
  for (const r of rows) {
    const avg = r.avgIntervalDays!;
    const daysAgo = daysSince(r.lastPurchaseAt, now) ?? 0;
    if (daysAgo < Math.max(MIN_QUIET_DAYS, QUIET_FACTOR * avg)) continue; // still within rhythm
    const c = r.customerId ? cmap.get(r.customerId) : null;
    if (c && (c.arWriteOffAt || c.status === "INACTIVE")) continue; // dead accounts — don't chase
    if (!manager && !(c && c.assignedRepId === session.userId)) continue; // reps see only their own
    const sales = Number(r.totalSales);
    const ratio = daysAgo / avg;
    alerts.push({
      id: r.id, name: c?.companyName ?? r.customerName, customerId: r.customerId, rep: c?.assignedRep?.name ?? null,
      phone: c?.phone ?? null, daysAgo, avg, buyDays: r.purchaseCount, sales, ratio, score: ratio * sales,
    });
  }
  alerts.sort((a, b) => b.score - a.score);
  const atRisk = alerts.reduce((s, a) => s + a.sales, 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">🔔 Reorder Alerts <span className="text-sm font-normal text-slate-400">— {company === "EVERFLOW" ? "Everflow (TX)" : "Rhino (FL)"}</span></h1>
        <p className="text-sm text-slate-500">
          Regular customers who have gone quiet past their normal buying rhythm — call them before they buy elsewhere.
          Based on real purchases from TireGuru (last 180 days, synced every 2h).
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard label="Customers going quiet" value={String(alerts.length)} tone={alerts.length > 0 ? "warn" : "good"} />
        <StatCard label="Window sales at risk" value={fmtMoney(atRisk)} tone={atRisk > 0 ? "warn" : "default"} />
        <StatCard label={manager ? "Scope" : "Your customers"} value={manager ? "All reps" : "Assigned to you"} />
      </div>

      <Card title={`Quiet customers (${alerts.length})`}>
        <Table>
          <THead cols={["Customer", ...(manager ? ["Rep"] : []), "Last bought", "Normal", "Buy-days", "Window $", "Status", ""]} />
          <tbody>
            {alerts.map(a => {
              const sev = a.ratio >= 4 ? "bg-red-100 text-red-700" : a.ratio >= 3 ? "bg-amber-100 text-amber-800" : "bg-yellow-50 text-yellow-700";
              return (
                <tr key={a.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="px-3 py-2 font-medium">
                    {a.customerId
                      ? <Link href={`/customers/${a.customerId}`} className="text-brand-700 hover:underline">{a.name}</Link>
                      : <span className="text-slate-700">{a.name} <span className="text-xs text-slate-400">· not in CRM</span></span>}
                    {a.phone && <div className="text-xs text-slate-400">{a.phone}</div>}
                  </td>
                  {manager && <td className="px-3 py-2 text-sm text-slate-500">{a.rep ?? "—"}</td>}
                  <td className="px-3 py-2 tabular-nums"><span className="font-semibold text-slate-800">{a.daysAgo}d ago</span></td>
                  <td className="px-3 py-2 text-sm text-slate-500">every ~{a.avg}d</td>
                  <td className="px-3 py-2 tabular-nums text-slate-500">{a.buyDays}</td>
                  <td className="px-3 py-2 tabular-nums font-medium">{fmtMoney(a.sales)}</td>
                  <td className="px-3 py-2"><Badge className={sev}>{a.ratio >= 4 ? "Very overdue" : a.ratio >= 3 ? "Overdue" : "Slipping"}</Badge></td>
                  <td className="px-3 py-2 text-right">{a.customerId && <QuickLogButton customerId={a.customerId} label="Log Call" variant="secondary" size="sm" />}</td>
                </tr>
              );
            })}
            {alerts.length === 0 && <EmptyRow colSpan={manager ? 8 : 7} message="No customers are overdue right now — your regulars are buying on rhythm." />}
          </tbody>
        </Table>
        <p className="mt-2 text-xs text-slate-400">&quot;Normal&quot; = this customer&apos;s average days between purchase days over the last 180 days. Flagged when they&apos;re 2× past that (and ≥21 days). Written-off and inactive customers are excluded.</p>
      </Card>
    </div>
  );
}
