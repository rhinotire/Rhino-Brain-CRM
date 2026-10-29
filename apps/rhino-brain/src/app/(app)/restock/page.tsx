import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireSession, isManager } from "@/lib/auth";
import { companyFor } from "@/actions/competitor-lookup";
import { Card, StatCard, Table, THead, EmptyRow, Badge } from "@/components/ui/primitives";
import { fmtMoney } from "@/lib/domain";

export const dynamic = "force-dynamic";

/**
 * Restock suggestions (owner request 2026-10-28): what to reorder before it
 * stocks out, and what dead stock to clear. Joins current InventorySnapshot
 * (per company warehouse) with ProductVelocity (per-SKU sell-through from the
 * TireGuru Customer Transaction File, last ~180 days, synced 2h).
 *   Running low = sells regularly (>=6 units/180d) and < ~45 days of cover left.
 *   Dead stock  = on hand but zero sales in the last 180 days.
 */
const WINDOW_DAYS = 180;
const LOW_COVER_DAYS = 45;
const MIN_SELL = 6; // ignore long-tail items that barely move
const TARGET_COVER_DAYS = 90; // suggested order brings cover up to ~3 months

export default async function RestockPage() {
  const session = await requireSession();
  if (!isManager(session)) redirect("/my-work");
  const company = await companyFor(session);
  const tag = company === "EVERFLOW" ? "TX" : "FL";

  const [stock, velocity] = await Promise.all([
    db.inventorySnapshot.findMany({
      where: { quantity: { gt: 0 }, location: { shortTag: tag }, product: { active: true } },
      select: {
        quantity: true, incomingQty: true, incomingEta: true,
        product: { select: { sku: true, sizeSpec: true, brand: true, description: true, cost: true } },
      },
    }),
    db.productVelocity.findMany({ where: { company }, select: { sku: true, unitsSold: true } }),
  ]);
  const velMap = new Map(velocity.map(v => [v.sku, v.unitsSold]));

  type LowRow = { sku: string; label: string; size: string; qty: number; incoming: number; sold: number; daysLeft: number; order: number };
  type DeadRow = { sku: string; label: string; size: string; qty: number; tied: number };
  const low: LowRow[] = [];
  const dead: DeadRow[] = [];

  for (const s of stock) {
    const p = s.product;
    const sold = velMap.get(p.sku) ?? 0;
    const label = `${p.brand ? p.brand + " " : ""}${p.description}`.trim().slice(0, 46);
    const size = p.sizeSpec ?? "";
    if (sold <= 0) {
      dead.push({ sku: p.sku, label, size, qty: s.quantity, tied: s.quantity * Number(p.cost ?? 0) });
      continue;
    }
    const daily = sold / WINDOW_DAYS;
    const daysLeft = Math.round(s.quantity / daily);
    if (sold >= MIN_SELL && daysLeft < LOW_COVER_DAYS) {
      const order = Math.max(0, Math.ceil(daily * TARGET_COVER_DAYS - s.quantity - s.incomingQty));
      if (order > 0) low.push({ sku: p.sku, label, size, qty: s.quantity, incoming: s.incomingQty, sold, daysLeft, order });
    }
  }
  low.sort((a, b) => a.daysLeft - b.daysLeft);
  dead.sort((a, b) => b.tied - a.tied);
  const deadTied = dead.reduce((s, d) => s + d.tied, 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">📦 Restock Suggestions <span className="text-sm font-normal text-slate-400">— {company === "EVERFLOW" ? "Everflow (TX)" : "Rhino (FL)"}</span></h1>
        <p className="text-sm text-slate-500">What to reorder before it runs out, and what dead stock to clear. Sell-through from TireGuru (last 180 days, synced every 2h).</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard label="Running low (reorder)" value={String(low.length)} tone={low.length > 0 ? "warn" : "good"} />
        <StatCard label="Dead SKUs (no sales 180d)" value={String(dead.length)} tone={dead.length > 0 ? "warn" : "good"} />
        <StatCard label="Cash tied in dead stock" value={fmtMoney(deadTied)} tone={deadTied > 0 ? "danger" : "good"} />
      </div>

      <Card title={`Running low — reorder soon (${low.length})`}>
        <Table>
          <THead cols={["Size", "Product", "In stock", "Incoming", "Sold (180d)", "~Days left", "Suggest order"]} />
          <tbody>
            {low.slice(0, 100).map(r => (
              <tr key={r.sku} className="border-b border-slate-50 hover:bg-slate-50">
                <td className="px-3 py-2 font-medium">{r.size || r.sku}</td>
                <td className="px-3 py-2 text-sm text-slate-600">{r.label}</td>
                <td className="px-3 py-2 tabular-nums">{r.qty}</td>
                <td className="px-3 py-2 tabular-nums text-slate-400">{r.incoming || "—"}</td>
                <td className="px-3 py-2 tabular-nums text-slate-500">{r.sold}</td>
                <td className="px-3 py-2"><Badge className={r.daysLeft < 14 ? "bg-red-100 text-red-700" : r.daysLeft < 30 ? "bg-amber-100 text-amber-800" : "bg-yellow-50 text-yellow-700"}>{r.daysLeft}d</Badge></td>
                <td className="px-3 py-2 font-semibold tabular-nums text-brand-700">+{r.order}</td>
              </tr>
            ))}
            {low.length === 0 && <EmptyRow colSpan={7} message="Nothing running low — stock cover looks healthy." />}
          </tbody>
        </Table>
        <p className="mt-2 text-xs text-slate-400">&quot;Suggest order&quot; tops cover back up to ~{TARGET_COVER_DAYS} days at the current sell-through, minus what&apos;s already incoming.</p>
      </Card>

      <Card title={`Dead stock — not selling (${dead.length})`}>
        <Table>
          <THead cols={["Size", "Product", "In stock", "Cash tied up"]} />
          <tbody>
            {dead.slice(0, 100).map(r => (
              <tr key={r.sku} className="border-b border-slate-50 hover:bg-slate-50">
                <td className="px-3 py-2 font-medium">{r.size || r.sku}</td>
                <td className="px-3 py-2 text-sm text-slate-600">{r.label}</td>
                <td className="px-3 py-2 tabular-nums">{r.qty}</td>
                <td className="px-3 py-2 tabular-nums font-medium">{r.tied > 0 ? fmtMoney(r.tied) : "—"}</td>
              </tr>
            ))}
            {dead.length === 0 && <EmptyRow colSpan={4} message="No dead stock — everything on hand has sold recently." />}
          </tbody>
        </Table>
        <p className="mt-2 text-xs text-slate-400">On hand with zero sales in the last 180 days — candidates to promote or clear. Cash tied up = quantity × cost.</p>
      </Card>
    </div>
  );
}
