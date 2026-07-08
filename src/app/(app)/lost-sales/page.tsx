import Link from "next/link";
import { subDays } from "date-fns";
import { db } from "@/lib/db";
import { requireSession, isManager, repScope, locationScope } from "@/lib/auth";
import { Table, THead, EmptyRow, Badge, StatCard, Card } from "@/components/ui/primitives";
import { fmtMoney, fmtDate } from "@/lib/domain";
import type { LostSaleReason } from "@prisma/client";

export const dynamic = "force-dynamic";

const REASON_LABELS: Record<LostSaleReason, string> = {
  NO_STOCK: "No stock",
  PRICE: "Competitor price",
  OTHER: "Other reason",
};

export default async function LostSalesPage() {
  const session = await requireSession();
  const manager = isManager(session);

  const events = await db.lostSale.findMany({
    where: {
      occurredAt: { gte: subDays(new Date(), 30) },
      ...repScope(session, "repId"),
      ...locationScope(session),
    },
    orderBy: { occurredAt: "desc" },
    include: {
      rep: { select: { name: true } },
      customer: { select: { id: true } },
    },
  });

  const total = events.reduce((s, e) => s + Number(e.estValue), 0);
  const byReason = (Object.keys(REASON_LABELS) as LostSaleReason[]).map(r => ({
    reason: r,
    n: events.filter(e => e.reason === r).length,
    val: events.filter(e => e.reason === r).reduce((s, e) => s + Number(e.estValue), 0),
  }));

  // Lost demand grouped by item
  const byItem = new Map<string, { n: number; val: number; reasons: Set<LostSaleReason>; customers: Set<string> }>();
  for (const e of events) {
    const it = byItem.get(e.item) ?? { n: 0, val: 0, reasons: new Set(), customers: new Set() };
    it.n++; it.val += Number(e.estValue); it.reasons.add(e.reason); it.customers.add(e.customerName);
    byItem.set(e.item, it);
  }
  const items = [...byItem.entries()].sort((a, b) => b[1].val - a[1].val);

  // Win-back: NO_STOCK items whose size now shows stock somewhere
  const noStockItems = items.filter(([, v]) => v.reasons.has("NO_STOCK")).map(([it]) => it);
  const winback: { item: string; sku: string; size: string | null; desc: string; qty: number; customers: string[] }[] = [];
  for (const item of noStockItems.slice(0, 20)) {
    const p = await db.product.findFirst({
      where: { sizeSpec: { contains: item, mode: "insensitive" }, inventory: { some: { quantity: { gt: 0 } } } },
      include: { inventory: { where: { quantity: { gt: 0 } } } },
    });
    if (p) {
      winback.push({
        item, sku: p.sku, size: p.sizeSpec, desc: p.description,
        qty: p.inventory.reduce((s, i) => s + i.quantity, 0),
        customers: [...(byItem.get(item)?.customers ?? [])],
      });
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">💸 {manager ? "Lost Sales" : "My Lost Sales"} <span className="text-sm font-normal text-slate-400">(last 30 days)</span></h1>
      <p className="text-sm text-slate-500">Every &quot;no&quot; your team hears, turned into restock signals and pricing intel. Logged from the Outcome field when logging a call.</p>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label={`Lost last 30 days (${events.length} events)`} value={fmtMoney(total)} tone={total > 0 ? "danger" : "default"} />
        {byReason.map(r => (
          <StatCard key={r.reason} label={`${REASON_LABELS[r.reason]} · ${r.n}×`} value={fmtMoney(r.val)} />
        ))}
      </div>

      {winback.length > 0 && (
        <Card title="🔄 Win-back opportunities — lost items now BACK IN STOCK">
          <div className="space-y-2">
            {winback.map(w => (
              <div key={w.item} className="flex items-center justify-between rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm">
                <div>
                  <span className="font-semibold">{w.size ?? w.item}</span> {w.desc} — <span className="font-semibold text-emerald-700">{w.qty} in stock now</span>
                  <div className="text-xs text-slate-500">Asked for it and walked: {w.customers.join(", ")}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card title="📦 What to restock / reprice — lost demand by item">
        <Table>
          <THead cols={["Item", "Events", "Lost Value", "Customers", "Reasons"]} />
          <tbody>
            {items.map(([item, v]) => (
              <tr key={item} className="border-b border-slate-50">
                <td className="px-3 py-2 font-medium">{item}</td>
                <td className="px-3 py-2 tabular-nums">{v.n}</td>
                <td className="px-3 py-2 font-semibold tabular-nums text-red-600">{fmtMoney(v.val)}</td>
                <td className="px-3 py-2 text-slate-600">{[...v.customers].slice(0, 3).join(", ")}{v.customers.size > 3 ? ` +${v.customers.size - 3}` : ""}</td>
                <td className="px-3 py-2">{[...v.reasons].map(r => <Badge key={r} className="mr-1 bg-red-100 text-red-700">{REASON_LABELS[r]}</Badge>)}</td>
              </tr>
            ))}
            {items.length === 0 && <EmptyRow colSpan={5} message='No lost sales recorded yet — they are captured from the "Outcome" field when logging a call.' />}
          </tbody>
        </Table>
      </Card>

      <Card title="Recent lost-sale events">
        <Table>
          <THead cols={["Date", "Customer", "Rep", "Item", "Qty", "Est. Value", "Reason", "Competitor"]} />
          <tbody>
            {events.map(e => (
              <tr key={e.id} className="border-b border-slate-50">
                <td className="px-3 py-2 whitespace-nowrap">{fmtDate(e.occurredAt)}</td>
                <td className="px-3 py-2 font-medium">
                  {e.customer ? <Link href={`/customers/${e.customer.id}`} className="text-brand-700 hover:underline">{e.customerName}</Link> : e.customerName}
                </td>
                <td className="px-3 py-2 text-slate-600">{e.rep.name}</td>
                <td className="px-3 py-2">{e.item}</td>
                <td className="px-3 py-2 tabular-nums">{e.quantity || "—"}</td>
                <td className="px-3 py-2 tabular-nums text-red-600">{fmtMoney(Number(e.estValue))}</td>
                <td className="px-3 py-2"><Badge className="bg-red-100 text-red-700">{REASON_LABELS[e.reason]}</Badge></td>
                <td className="px-3 py-2 text-slate-600">{e.competitor ? `${e.competitor}${e.competitorPrice ? ` @ ${fmtMoney(Number(e.competitorPrice))}` : ""}` : "—"}</td>
              </tr>
            ))}
            {events.length === 0 && <EmptyRow colSpan={8} message="No lost sales in the last 30 days." />}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
