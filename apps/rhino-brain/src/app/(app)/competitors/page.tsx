import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireSession, hasPerm, isManager, isAccounting } from "@/lib/auth";
import { Table, THead, EmptyRow, Badge, StatCard } from "@/components/ui/primitives";
import { fmtMoney } from "@/lib/domain";
import { CompetitorSearch } from "@/components/competitor-search";

export const dynamic = "force-dynamic";

const SITE_LABEL: Record<string, string> = { tgi: "TGI", qtd: "QTD", tiredispatch: "Tire Dispatch" };

/**
 * Competitor Prices (owner request 2026-10-20): the PC robot checks the
 * owner's dealer accounts at QTD / TGI / Tire Dispatch daily for the top
 * stocked tire sizes. One row per size: our best stocked price vs each
 * competitor's cheapest — red when we're undercut. Managers only (pricing
 * intelligence is not for rep-level eyes).
 */
export default async function CompetitorsPage({ searchParams }: { searchParams: { q?: string } }) {
  const session = await requireSession();
  if (!hasPerm(session, "products") || !(isManager(session) || isAccounting(session))) redirect("/my-work");

  const qDigits = (searchParams.q ?? "").replace(/-?\s*\d+\s*PR\b/i, "").replace(/\D/g, "");
  const comp = await db.competitorPrice.findMany({ orderBy: { fetchedAt: "desc" } });
  const lastFetch = comp[0]?.fetchedAt ?? null;
  const sizeKeys = [...new Set(comp.map(c => c.sizeKey))];

  // our best (cheapest priceA) in-stock product per size
  const products = await db.product.findMany({
    where: { active: true, sizeSpec: { not: null }, priceA: { not: null }, inventory: { some: { quantity: { gt: 0 } } } },
    select: { sku: true, description: true, brand: true, sizeSpec: true, priceA: true, inventory: { select: { quantity: true } } },
  });
  const mine = new Map<string, { price: number; label: string; qty: number; display: string }>();
  for (const p of products) {
    const key = p.sizeSpec!.replace(/-?\s*\d+\s*PR\b/i, "").replace(/\D/g, "");
    if (!sizeKeys.includes(key)) continue;
    const price = Number(p.priceA);
    const qty = p.inventory.reduce((s, i) => s + i.quantity, 0);
    const cur = mine.get(key);
    if (!cur || price < cur.price) mine.set(key, { price, label: `${p.brand ?? ""} ${p.description.slice(0, 24)}`, qty, display: p.sizeSpec!.trim() });
  }

  type Row = {
    sizeKey: string; display: string;
    my: { price: number; label: string; qty: number } | null;
    best: Record<string, { price: number; description: string; availability: string | null }>;
    undercut: boolean;
  };
  const rows: Row[] = sizeKeys.map(key => {
    const my = mine.get(key) ?? null;
    const best: Row["best"] = {};
    for (const c of comp.filter(x => x.sizeKey === key)) {
      const price = Number(c.price);
      if (!best[c.site] || price < best[c.site].price) best[c.site] = { price, description: c.description, availability: c.availability };
    }
    const cheapest = Math.min(...Object.values(best).map(b => b.price));
    return {
      sizeKey: key,
      display: my?.display ?? comp.find(x => x.sizeKey === key)?.description.split(" ")[0] ?? key,
      my: my ? { price: my.price, label: my.label, qty: my.qty } : null,
      best,
      undercut: !!my && Number.isFinite(cheapest) && cheapest < my.price,
    };
  }).filter(r => !qDigits || r.sizeKey.includes(qDigits))
    .sort((a, b) => Number(b.undercut) - Number(a.undercut) || a.display.localeCompare(b.display));

  const sites = [...new Set(comp.map(c => c.site))];
  const undercutCount = rows.filter(r => r.undercut).length;

  // searching a specific size → DETAIL view: every competitor offer for that
  // size (not just each site's cheapest) plus all our in-stock options
  const detailOffers = qDigits
    ? comp.filter(c => c.sizeKey.includes(qDigits)).sort((a, b) => Number(a.price) - Number(b.price))
    : [];
  const detailMine = qDigits
    ? products
        .filter(p => p.sizeSpec!.replace(/-?\s*\d+\s*PR\b/i, "").replace(/\D/g, "").includes(qDigits))
        .map(p => ({ sku: p.sku, brand: p.brand, description: p.description, price: Number(p.priceA), qty: p.inventory.reduce((s, i) => s + i.quantity, 0), sizeSpec: p.sizeSpec! }))
        .sort((a, b) => a.price - b.price)
    : [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Competitor Prices</h1>
        <p className="text-sm text-slate-500">
          Your dealer accounts at {sites.map(s => SITE_LABEL[s] ?? s).join(", ") || "—"} · checked daily for your top stocked sizes
          {lastFetch && <> · last check {lastFetch.toLocaleString("en-US", { timeZone: "America/New_York" })} ET</>}
        </p>
      </div>

      <CompetitorSearch hasData={rows.length > 0 || detailOffers.length > 0} />

      {qDigits ? (
        <>
          {/* four companies side by side — each column's offers cheapest-first */}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {[
              {
                name: "🦏 Rhino / Everflow",
                items: detailMine.map(p => ({
                  key: p.sku,
                  top: `${p.brand ?? ""} ${p.description.slice(0, 30)}`.trim(),
                  sub: `${p.sizeSpec} · ${p.qty} in stock · ${p.sku}`,
                  price: p.price,
                })),
                ours: true,
              },
              ...["tgi", "qtd", "tiredispatch"].map(site => ({
                name: SITE_LABEL[site] ?? site,
                items: detailOffers.filter(c => c.site === site).map(c => ({
                  key: c.id,
                  top: c.description.slice(0, 44),
                  sub: `${c.availability ?? ""}${c.partCode ? ` · ${c.partCode}` : ""}`,
                  price: Number(c.price),
                })),
                ours: false,
              })),
            ].map(col => {
              const ourBest = detailMine[0]?.price;
              return (
                <div key={col.name} className="rounded-lg border border-slate-200 bg-white shadow-sm">
                  <div className={`border-b border-slate-100 px-3 py-2 text-sm font-semibold ${col.ours ? "text-brand-700" : "text-slate-700"}`}>
                    {col.name} <span className="font-normal text-slate-400">({col.items.length})</span>
                  </div>
                  <div className="divide-y divide-slate-50">
                    {col.items.map(it => {
                      const beats = !col.ours && ourBest !== undefined && it.price < ourBest;
                      return (
                        <div key={it.key} className="flex items-start justify-between gap-2 px-3 py-2">
                          <div className="min-w-0">
                            <div className="truncate text-sm text-slate-800">{it.top}</div>
                            <div className="truncate text-xs text-slate-400">{it.sub}</div>
                          </div>
                          <div className={`shrink-0 text-sm font-semibold tabular-nums ${beats ? "text-red-600" : ""}`}>{fmtMoney(it.price)}</div>
                        </div>
                      );
                    })}
                    {col.items.length === 0 && <div className="px-3 py-3 text-xs text-slate-400">{col.ours ? "No in-stock product of this size." : "No data — use Fetch above."}</div>}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-slate-400">Each column sorted cheapest first. Red = cheaper than our cheapest in-stock option. Competitor prices are their dealer cost to you (incl. FET where shown).</p>
        </>
      ) : (
      <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Sizes watched" value={String(rows.length)} />
        <StatCard label="You're undercut on" value={String(undercutCount)} tone={undercutCount > 0 ? "danger" : "good"} />
      </div>

      <Table>
        <THead cols={["Size", "Our best (in stock)", ...sites.map(s => SITE_LABEL[s] ?? s), "Status"]} />
        <tbody>
          {rows.map(r => (
            <tr key={r.sizeKey} className="border-b border-slate-50 hover:bg-slate-50">
              <td className="px-3 py-2 font-medium">{r.display}</td>
              <td className="px-3 py-2">
                {r.my ? (
                  <>
                    <span className="font-semibold tabular-nums">{fmtMoney(r.my.price)}</span>
                    <span className="ml-1 text-xs text-slate-400">{r.my.label} · {r.my.qty} in stock</span>
                  </>
                ) : <span className="text-slate-400">—</span>}
              </td>
              {sites.map(s => {
                const b = r.best[s];
                const beatsUs = b && r.my && b.price < r.my.price;
                return (
                  <td key={s} className="px-3 py-2 tabular-nums">
                    {b ? (
                      <>
                        <span className={beatsUs ? "font-semibold text-red-600" : ""}>{fmtMoney(b.price)}</span>
                        <span className="ml-1 text-xs text-slate-400">{b.description.slice(0, 26)}{b.availability ? ` · ${b.availability}` : ""}</span>
                      </>
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                );
              })}
              <td className="px-3 py-2">
                {r.undercut
                  ? <Badge className="bg-red-100 text-red-700">UNDERCUT</Badge>
                  : r.my ? <Badge className="bg-emerald-100 text-emerald-700">OK</Badge> : null}
              </td>
            </tr>
          ))}
          {rows.length === 0 && <EmptyRow colSpan={4 + sites.length} message={qDigits ? "No data for this size yet — use the Fetch button above to pull it live." : "No competitor data yet — the robot runs daily at 9am."} />}
        </tbody>
      </Table>
      <p className="text-xs text-slate-400">Prices are what YOUR dealer account sees at each competitor. Internal use only.</p>
      </>
      )}
    </div>
  );
}
