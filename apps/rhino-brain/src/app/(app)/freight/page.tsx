import Link from "next/link";
import { db } from "@/lib/db";
import { requireManager, locationScope } from "@/lib/auth";
import { CheckRepliesButton } from "@/components/freight-quote-table";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, string> = {
  QUOTING: "bg-amber-100 text-amber-800",
  BOOKED: "bg-emerald-100 text-emerald-800",
  PICKED_UP: "bg-blue-100 text-blue-800",
  DELIVERED: "bg-slate-200 text-slate-600",
  CANCELLED: "bg-red-100 text-red-700",
};

export default async function FreightPage() {
  const session = await requireManager();
  const scope = locationScope(session);
  const shipments = await db.freightShipment.findMany({
    where: { ...scope },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      stops: { include: { consignee: true }, orderBy: { sequence: "asc" } },
      quotes: true,
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">Freight</h1>
        <div className="flex items-center gap-2">
          <CheckRepliesButton />
          <Link href="/freight/carriers" className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Carriers</Link>
          <Link href="/freight/consignees" className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Consignees</Link>
          <Link href="/freight/new" className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700">+ New Quote Request</Link>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="p-2">Ref</th><th className="p-2">Route</th><th className="p-2">Pickup</th>
              <th className="p-2">Status</th><th className="p-2">Replies</th><th className="p-2">Best Price</th>
            </tr>
          </thead>
          <tbody>
            {shipments.map((s) => {
              const replied = s.quotes.filter((q) => q.repliedAt).length;
              const prices = s.quotes.filter((q) => q.price !== null).map((q) => Number(q.price));
              const route = s.stops.map((st) => `${st.consignee.city} ${st.consignee.state}`).join(" + ");
              return (
                <tr key={s.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="p-2 font-mono"><Link href={`/freight/${s.id}`} className="text-blue-700 hover:underline">{s.refCode}</Link></td>
                  <td className="p-2">{s.originLabel} → {route}</td>
                  <td className="p-2">{s.pickupDate.toISOString().slice(0, 10)}</td>
                  <td className="p-2"><span className={`rounded px-2 py-0.5 text-xs font-semibold ${STATUS_BADGE[s.status]}`}>{s.status}</span></td>
                  <td className="p-2">{replied}/{s.quotes.length}</td>
                  <td className="p-2">{prices.length ? `$${Math.min(...prices).toLocaleString()}` : "—"}</td>
                </tr>
              );
            })}
            {shipments.length === 0 && (
              <tr><td colSpan={6} className="p-6 text-center text-slate-400">No shipments yet — click &quot;+ New Quote Request&quot; above</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
